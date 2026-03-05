package main

import (
	"encoding/json"
	"log"
	"math"
	"math/rand"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	W = 100
	H = 100
) // grid dimension

const (
	StateEmpty   = 0 // bare soil
	StateYoung   = 1 // new tree: low flammability, slower burn
	StateMature  = 2 // old tree: higher flammability
	StateBurning = 3 // burning
	StateEmbers  = 4 // dying embers:  still spreads fire at reduced rate
	StateAsh     = 5 // cooling ash: slowly reverts to empty
	StateWater   = 6 // river: permanent firebreak
) // cell states


type Config struct {
	GrowthRate    float64 `json:"growth_rate"`    // empty -> young tree probability
	MaturityRate  float64 `json:"maturity_rate"`  // young -> mature probability per tick
	LightningRate float64 `json:"lightning_rate"` // spontaneous ignition probability
	Humidity      float64 `json:"humidity"`       // 0-1: suppresses ignition
	WindAngle     float64 `json:"wind_angle"`     // 0-360 degrees
	WindStrength  float64 `json:"wind_strength"`  // 0-1
	EmberJump     bool    `json:"ember_jump"`     // wind-carried ember rule
	RainEnabled   bool    `json:"rain_enabled"`   // periodic rain events rule
	FPS           int     `json:"fps"`            // simulation speed
}

func defaultConfig() Config {
	return Config{
		GrowthRate:    0.008,
		MaturityRate:  0.004,
		LightningRate: 0.00008,
		Humidity:      0.25,
		WindAngle:     45.0,
		WindStrength:  0.5,
		EmberJump:     true,
		RainEnabled:   true,
		FPS:           12,
	}
}

type Stats struct {
	Empty   int  `json:"empty"`
	Young   int  `json:"young"`
	Mature  int  `json:"mature"`
	Burning int  `json:"burning"`
	Embers  int  `json:"embers"`
	Ash     int  `json:"ash"`
	Water   int  `json:"water"`
	Tick    int  `json:"tick"`
	Raining bool `json:"raining"`
}

type Cell struct {
	State int
	Age   int // ticks alive (used for maturity & old-tree flammability)
}

type Sim struct {
	mu   sync.RWMutex
	grid [H][W]Cell
	elev [H][W]float64

	cfg      Config
	stats    Stats
	running  bool
	raining  bool
	rainTick int // ticks remaining in current rain event
	rainWait int // ticks until next rain event

	tick int

	upgrader  websocket.Upgrader
	clients   map[*websocket.Conn]chan []byte
	clientsMu sync.Mutex
}

func newSim() *Sim {
	s := &Sim{
		cfg:      defaultConfig(),
		clients:  make(map[*websocket.Conn]chan []byte),
		rainWait: 300 + rand.Intn(400),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}
	s.generateElevation()
	s.initGrid()
	s.computeStats()
	return s
}

// generateElevation creates a smooth heightmap using value noise
// elevation affects fire spread : fire climbs hills faster
func (s *Sim) generateElevation() {
	const cs = 12
	var coarse [cs + 1][cs + 1]float64
	for i := range coarse {
		for j := range coarse[i] {
			coarse[i][j] = rand.Float64()
		}
	}
	for y := 0; y < H; y++ {
		for x := 0; x < W; x++ {
			fx := float64(x) / float64(W) * float64(cs)
			fy := float64(y) / float64(H) * float64(cs)
			ix, iy := int(fx), int(fy)
			if ix >= cs {
				ix = cs - 1
			}
			if iy >= cs {
				iy = cs - 1
			}
			tx := fx - float64(ix)
			ty := fy - float64(iy)
			// smoothstep interpolation
			tx = tx * tx * (3 - 2*tx)
			ty = ty * ty * (3 - 2*ty)
			s.elev[y][x] = lerp(
				lerp(coarse[iy][ix], coarse[iy][ix+1], tx),
				lerp(coarse[iy+1][ix], coarse[iy+1][ix+1], tx),
				ty,
			)
		}
	}
}

func lerp(a, b, t float64) float64 { return a + (b-a)*t }

// initGrid seeds the world with trees and rivers
func (s *Sim) initGrid() {
	for y := 0; y < H; y++ {
		for x := 0; x < W; x++ {
			s.grid[y][x] = Cell{}
		}
	}
	// water bodies act as permanent firebreaks
	s.placeRivers()
	// seed initial trees
	for y := 0; y < H; y++ {
		for x := 0; x < W; x++ {
			if s.grid[y][x].State != StateEmpty {
				continue
			}
			r := rand.Float64()

			if r < 0.20 {
				s.grid[y][x] = Cell{State: StateYoung, Age: rand.Intn(40)}
			} else if r < 0.50 {
				s.grid[y][x] = Cell{State: StateMature, Age: 60 + rand.Intn(280)}
			}
		}
	}
}

// draws 1/2  rivers
// fire never crosses them directly
func (s *Sim) placeRivers() {
	n := 1 + rand.Intn(2)
	for r := 0; r < n; r++ {
		x := 15 + rand.Intn(W-30)
		for y := 0; y < H; y++ {
			width := 1 + rand.Intn(2)
			for w := 0; w < width; w++ {
				s.grid[y][(x+w+W)%W] = Cell{State: StateWater}
			}
			if rand.Float64() < 0.35 {
				x += rand.Intn(3) - 1
				if x < 2 {
					x = 2
				}
				if x >= W-2 {
					x = W - 3
				}
			}
		}
	}
}

// windVec returns the wind vector scaled by strength
func (s *Sim) windVec() (float64, float64) {
	rad := s.cfg.WindAngle * math.Pi / 180.0
	return math.Cos(rad) * s.cfg.WindStrength,
		math.Sin(rad) * s.cfg.WindStrength
}

// stepLocked advances the simulation one tick
// caller must hold s.mu.Lock().
func (s *Sim) stepLocked() {
	cfg := s.cfg
	wdx, wdy := s.windVec()

	// rain events
	if cfg.RainEnabled {
		if s.raining {
			s.rainTick--
			if s.rainTick <= 0 {
				s.raining = false
				s.rainWait = 500 + rand.Intn(600)
			}
		} else {
			s.rainWait--
			if s.rainWait <= 0 {
				s.raining = true
				s.rainTick = 60 + rand.Intn(120)
			}
		}
	} else {
		s.raining = false
	}

	humidity := cfg.Humidity
	if s.raining {
		humidity = math.Min(1.0, humidity+0.65)
	}

	next := s.grid // value copy (entire array)

	for y := 0; y < H; y++ {
		for x := 0; x < W; x++ {
			cell := s.grid[y][x]

			switch cell.State {

				case StateEmpty:
					// spontaneous regrowth
					if rand.Float64() < cfg.GrowthRate {
						next[y][x] = Cell{State: StateYoung}
					}

				case StateYoung:
					next[y][x].Age = cell.Age + 1
					// maturation : new trees grow into mature
					if rand.Float64() < cfg.MaturityRate {
						next[y][x].State = StateMature
						break
					}
					// new trees are ~35% less likely to ignite than mature
					if rand.Float64() < cfg.LightningRate*0.65 ||
						s.checkFireSpread(x, y, wdx, wdy, humidity, 0.38) {
						next[y][x] = Cell{State: StateBurning}
					}

				case StateMature:
					next[y][x].Age = cell.Age + 1
					// old mature trees (age>250) extra flammable
					ageBonus := 0.0
					if cell.Age > 250 {
						ageBonus = 0.12
					}
					if rand.Float64() < cfg.LightningRate ||
						s.checkFireSpread(x, y, wdx, wdy, humidity, 0.55+ageBonus) {
						next[y][x] = Cell{State: StateBurning}
					}

				case StateBurning:
					// burning ==> embers stage
					next[y][x] = Cell{State: StateEmbers, Age: 0}
					if s.raining && rand.Float64() < 0.20 {
						next[y][x] = Cell{State: StateAsh}
					}

				case StateEmbers:
					// embers persist 2-3 ticks then become ash
					next[y][x].Age = cell.Age + 1
					if cell.Age >= 2 || (s.raining && rand.Float64() < 0.55) {
						next[y][x] = Cell{State: StateAsh}
					}

				case StateAsh:
					// ash slowly clears back to empty soil
					if rand.Float64() < 0.025 {
						next[y][x] = Cell{State: StateEmpty}
					}

				case StateWater:
					// water never changes
			}
		}
	}

	// ember jump - strong wind carries sparks over obstacles
	if cfg.EmberJump && cfg.WindStrength > 0.45 {
		for y := 0; y < H; y++ {
			for x := 0; x < W; x++ {
				if s.grid[y][x].State != StateBurning {
					continue
				}
				if rand.Float64() > cfg.WindStrength*0.12 {
					continue
				}

				dist := 2 + rand.Intn(3)
				tx := (x + int(math.Round(wdx*float64(dist))) + W) % W
				ty := (y + int(math.Round(wdy*float64(dist))) + H) % H

				if st := next[ty][tx].State; st == StateYoung || st == StateMature {
					next[ty][tx] = Cell{State: StateBurning}
				}
			}
		}
	}

	s.grid = next
	s.tick++
}

// checkFireSpread returns true if a fire neighbor ignites cell (x,y)
// incorporates wind direction, elevation, water moisture, and humidity rules
func (s *Sim) checkFireSpread(x, y int, wdx, wdy, humidity, baseProb float64) bool {
	myElev := s.elev[y][x]
	// water adjacency provides moisture protection
	waterAdj := s.countWaterNeighbors(x, y)

	for dy := -1; dy <= 1; dy++ {
		for dx := -1; dx <= 1; dx++ {
			if dx == 0 && dy == 0 {
				continue
			}

			nx := (x + dx + W) % W
			ny := (y + dy + H) % H
			ns := s.grid[ny][nx].State

			if ns != StateBurning && ns != StateEmbers {
				continue
			}

			p := baseProb

			// wind direction boosts spread downwind
			// dx,dy points from neighbor to us; fire carries in wind direction
			p += (float64(dx)*wdx + float64(dy)*wdy) * 0.45

			// elevation — fire climbs uphill faster
			elevDiff := myElev - s.elev[ny][nx]
			p += elevDiff * 0.35

			// moisture from adjacent water cells
			p -= float64(waterAdj) * 0.07

			// humidity reduces ignition probability
			p -= humidity * 0.60

			// embers spread at reduced probability
			if ns == StateEmbers {
				p *= 0.6
			}

			p = math.Max(0, math.Min(1, p))
			if rand.Float64() < p {
				return true
			}
		}
	}
	return false
}

func (s *Sim) countWaterNeighbors(x, y int) int {
	c := 0
	for dy := -1; dy <= 1; dy++ {
		for dx := -1; dx <= 1; dx++ {
			if dx == 0 && dy == 0 {
				continue
			}

			if s.grid[(y+dy+H)%H][(x+dx+W)%W].State == StateWater {
				c++
			}
		}
	}
	return c
}

// computeStats tallies cells. Caller should hold at least a read lock
func (s *Sim) computeStats() {
	var st Stats
	st.Tick = s.tick
	st.Raining = s.raining
	for y := 0; y < H; y++ {
		for x := 0; x < W; x++ {
			switch s.grid[y][x].State {
				case StateEmpty:
					st.Empty++
				case StateYoung:
					st.Young++
				case StateMature:
					st.Mature++
				case StateBurning:
					st.Burning++
				case StateEmbers:
					st.Embers++
				case StateAsh:
					st.Ash++
				case StateWater:
					st.Water++
			}
		}
	}
	s.stats = st
}


func (s *Sim) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("ws upgrade:", err)
		return
	}

	ch := make(chan []byte, 64)
	s.clientsMu.Lock()
	s.clients[conn] = ch
	s.clientsMu.Unlock()

	// send initial full state
	s.mu.RLock()
	conn.WriteMessage(websocket.TextMessage, s.buildFullMsg())
	s.mu.RUnlock()

	disconnected := make(chan struct{})
	go func() {
		defer close(disconnected)
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	defer func() {
		s.clientsMu.Lock()
		delete(s.clients, conn)
		s.clientsMu.Unlock()
		conn.Close()
	}()

	for {
		select {
		case msg, ok := <-ch:
			if !ok {
				return
			}
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <- disconnected:
			return
		}
	}
}

type fullMsg struct {
	Type      string    `json:"type"`
	Width     int       `json:"width"`
	Height    int       `json:"height"`
	Cells     []int     `json:"cells"`
	Elevation []float64 `json:"elevation"`
	Stats     Stats     `json:"stats"`
	Config    Config    `json:"config"`
	Running   bool      `json:"running"`
}

func (s *Sim) buildFullMsg() []byte {
	cells := make([]int, W*H)
	elev := make([]float64, W*H)
	for y := 0; y < H; y++ {
		for x := 0; x < W; x++ {
			cells[y*W+x] = s.grid[y][x].State
			elev[y*W+x] = math.Round(s.elev[y][x]*1000) / 1000
		}
	}

	b, _ := json.Marshal(fullMsg{
		Type: "full", Width: W, Height: H,
		Cells: cells, Elevation: elev,
		Stats: s.stats, Config: s.cfg, Running: s.running,
	})
	return b
}

type deltaMsg struct {
	Type    string   `json:"type"`
	Changes [][2]int `json:"changes"`
	Stats   Stats    `json:"stats"`
	Running bool     `json:"running"`
}

func (s *Sim) broadcastDelta(prev [H][W]Cell) {
	s.mu.RLock()
	var changes [][2]int

	for y := 0; y < H; y++ {
		for x := 0; x < W; x++ {
			if s.grid[y][x].State != prev[y][x].State {
				changes = append(changes, [2]int{y*W + x, s.grid[y][x].State})
			}
		}
	}
	stats := s.stats
	running := s.running
	s.mu.RUnlock()

	b, _ := json.Marshal(deltaMsg{
		Type: "delta", Changes: changes,
		Stats: stats, Running: running,
	})

	s.clientsMu.Lock()
	for _, ch := range s.clients {
		select {
		case ch <- b:
		default: // slow client — drop frame
		}
	}
	s.clientsMu.Unlock()
}

func (s *Sim) broadcastFull() {
	s.mu.RLock()
	msg := s.buildFullMsg()
	s.mu.RUnlock()

	s.clientsMu.Lock()
	for _, ch := range s.clients {
		select {
		case ch <- msg:
		default:
		}
	}
	s.clientsMu.Unlock()
}

func cors(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

func jsonResp(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func (s *Sim) handleConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		s.mu.RLock()
		cfg := s.cfg
		s.mu.RUnlock()
		jsonResp(w, cfg)
		return
	}
	var cfg Config
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	if cfg.FPS < 1 {
		cfg.FPS = 1
	}
	if cfg.FPS > 60 {
		cfg.FPS = 60
	}
	s.mu.Lock()
	s.cfg = cfg
	s.mu.Unlock()
	s.broadcastFull()
	jsonResp(w, cfg)
}

func (s *Sim) handleControl(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Action string `json:"action"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	switch req.Action {
	case "start":
		s.mu.Lock()
		s.running = true
		s.mu.Unlock()

	case "pause":
		s.mu.Lock()
		s.running = false
		s.mu.Unlock()

	case "reset":
		s.mu.Lock()
		s.running = false
		s.tick = 0
		s.raining = false
		s.rainWait = 300 + rand.Intn(400)
		s.generateElevation()
		s.initGrid()
		s.computeStats()
		s.mu.Unlock()

	case "step":
		s.mu.Lock()
		wasRunning := s.running
		if !wasRunning {
			prev := s.grid
			s.stepLocked()
			s.computeStats()
			s.mu.Unlock()
			s.broadcastDelta(prev)
			jsonResp(w, map[string]string{"ok": "stepped"})
			return
		}
		s.mu.Unlock()
	}

	s.broadcastFull()
	jsonResp(w, map[string]string{"ok": req.Action})
}

func (s *Sim) handlePaint(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cells []struct {
			X     int `json:"x"`
			Y     int `json:"y"`
			State int `json:"state"`
		} `json:"cells"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	s.mu.Lock()
	prev := s.grid
	for _, c := range req.Cells {
		if c.X >= 0 && c.X < W && c.Y >= 0 && c.Y < H {
			s.grid[c.Y][c.X] = Cell{State: c.State}
		}
	}
	s.computeStats()
	s.mu.Unlock()
	s.broadcastDelta(prev)
	jsonResp(w, map[string]string{"ok": "painted"})
}

func (s *Sim) handleStats(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	st := s.stats
	s.mu.RUnlock()
	jsonResp(w, st)
}

func (s *Sim) run() {
	for {
		s.mu.RLock()
		running := s.running
		fps := s.cfg.FPS
		s.mu.RUnlock()

		if !running {
			time.Sleep(50 * time.Millisecond)
			continue
		}

		s.mu.Lock()
		prev := s.grid
		s.stepLocked()
		s.computeStats()
		s.mu.Unlock()

		s.broadcastDelta(prev)

		delay := time.Duration(1000/fps) * time.Millisecond
		time.Sleep(delay)
	}
}

func main() {
	rand.Seed(time.Now().UnixNano())
	sim := newSim()
	go sim.run()

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", sim.handleWS)
	mux.HandleFunc("/api/config", cors(sim.handleConfig))
	mux.HandleFunc("/api/control", cors(sim.handleControl))
	mux.HandleFunc("/api/paint", cors(sim.handlePaint))
	mux.HandleFunc("/api/stats", cors(sim.handleStats))

	log.Println("Forest Fire Observatory backend :8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}
