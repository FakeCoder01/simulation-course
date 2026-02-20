package main

import (
	"encoding/json"
	"log"
	"math"
	"net/http"
)

type SimRequest struct {
	Step     float64 `json:"step"`
	V0       float64 `json:"v0"`
	AngleDeg float64 `json:"angle"`
	Mass     float64 `json:"mass"`
	Cd       float64 `json:"cd"`
	Area     float64 `json:"area"`
	Color    string  `json:"color"`
}

type Point struct {
	T  float64 `json:"t"`
	X  float64 `json:"x"`
	Y  float64 `json:"y"`
	Vx float64 `json:"vx"`
	Vy float64 `json:"vy"`
	V  float64 `json:"v"`
}

type SimResult struct {
	Points        []Point `json:"points"`
	FlightRange   float64 `json:"flightRange"`
	MaxAltitude   float64 `json:"maxAltitude"`
	TerminalSpeed float64 `json:"terminalSpeed"`
	FlightTime    float64 `json:"flightTime"`
	Step          float64 `json:"step"`
	Color         string  `json:"color"`
}

const (
	g    = 9.81
	rho0 = 1.225
	H    = 8500.0
)

func airDensity(altitude float64) float64 {
	if altitude < 0 {
		altitude = 0
	}
	return rho0 * math.Exp(-altitude / H)
}


//// Fd = 1/2 * (ρv^2) * Cd * A
// velocity: new Velocity = old Velocity + (vcceleration * time)
// position: new Position = old Position + (velocity * time)
// time: advances by dt
func simulate(req SimRequest) SimResult {
	dt := req.Step
	angle := req.AngleDeg * math.Pi / 180.0

	vx := req.V0 * math.Cos(angle)
	vy := req.V0 * math.Sin(angle)

	x := 0.0
	y := 0.0
	t := 0.0

	maxY := 0.0

	var points []Point
	storeEvery := 1

	if dt < 0.001 {
		storeEvery = 10
	} else if dt < 0.01 {
		storeEvery = 5
	}

	stepCount := 0
	maxSteps := 10_000_000

	for stepCount < maxSteps {
		v := math.Sqrt(vx*vx + vy*vy)
		rho := airDensity(y)

		drag := 0.5 * req.Cd * rho * req.Area * v * v

		ax := -drag * vx / (v * req.Mass)
		ay := -g - drag * vy / (v * req.Mass)

		if stepCount % storeEvery == 0 {
			points = append(points, Point{T: t, X: x, Y: y, Vx: vx, Vy: vy, V: v})
		}

		vx += ax * dt
		vy += ay * dt
		x += vx * dt
		y += vy * dt
		t += dt
		stepCount++

		if y > maxY {
			maxY = y
		}
		if y <= 0 && t > dt*2 {
			break
		}
	}

	points = append(points, Point{T: t, X: x, Y: 0, Vx: vx, Vy: vy, V: math.Sqrt(vx*vx + vy*vy)})

	return SimResult{
		Points:        points,
		FlightRange:   x,
		MaxAltitude:   maxY,
		TerminalSpeed: math.Sqrt(vx*vx + vy*vy),
		FlightTime:    t,
		Step:          req.Step,
		Color:         req.Color,
	}
}

func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}

func simulateHandler(w http.ResponseWriter, r *http.Request) {
	var req SimRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.V0 == 0 {
		req.V0 = 100
	}
	if req.AngleDeg == 0 {
		req.AngleDeg = 45
	}
	if req.Mass == 0 {
		req.Mass = 1.0
	}
	if req.Cd == 0 {
		req.Cd = 0.47
	}
	if req.Area == 0 {
		req.Area = 0.01
	}
	if req.Step == 0 {
		req.Step = 0.1
	}
	if req.Color == "" {
		req.Color = "#00ffcc"
	}

	result := simulate(req)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}

func main() {
	http.HandleFunc("/api/simulate", corsMiddleware(simulateHandler))
	http.HandleFunc("/api/health", corsMiddleware(healthHandler))
	log.Println("Flight Simulation API running on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
