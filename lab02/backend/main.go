package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"
)

const MaxOps = 100_000_000

// temperature and profile may be nil if the simulation diverged or was too costly.
type SimResult struct {
	// nil means diverged / too costly
	Temperature *float64  `json:"temperature"`
	Profile     []float64 `json:"profile"` // sampled u values over x (length = ProfilePoints)
	XValues     []float64 `json:"x_values"` // corresponding x positions
	Stable      bool      `json:"stable"`
	CFL         float64   `json:"cfl"`
	NX          int       `json:"nx"`
	Steps       int       `json:"steps"`
	// params echoed back
	Alpha   float64 `json:"alpha"`
	L       float64 `json:"l"`
	TFinal  float64 `json:"t_final"`
	ICPeak  float64 `json:"ic_peak"`
	Dt      float64 `json:"dt"`
	Dx      float64 `json:"dx"`
	Message string  `json:"message"`
}

type SimParams struct {
	Alpha  float64
	L      float64
	TFinal float64
	ICPeak float64
	Dt     float64
	Dx     float64
}

func parseParam(r *http.Request, name string, def float64) (float64, error) {
	s := r.URL.Query().Get(name)
	if s == "" {
		return def, nil
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid %s: %w", name, err)
	}
	return v, nil
}

func simulate(p SimParams) SimResult {
	nx := int(math.Round(p.L/p.Dx)) + 1
	if nx < 3 {
		nx = 3
	}
	steps := int(math.Round(p.TFinal / p.Dt))
	if steps < 1 {
		steps = 1
	}
	r := p.Alpha * p.Dt / (p.Dx * p.Dx)
	stable := r <= 0.5

	ops := int64(nx) * int64(steps)
	if ops > MaxOps {
		return SimResult{
			Temperature: nil,
			Stable:      stable,
			CFL:         r,
			NX:          nx,
			Steps:       steps,
			Alpha:       p.Alpha,
			L:           p.L,
			TFinal:      p.TFinal,
			ICPeak:      p.ICPeak,
			Dt:          p.Dt,
			Dx:          p.Dx,
			Message:     fmt.Sprintf("Too costly: %d ops exceeds limit %d. Refine Δt or Δx.", ops, MaxOps),
		}
	}

	// u[i] at x = i*dx
	u := make([]float64, nx)
	for i := 0; i < nx; i++ {
		x := float64(i) * p.Dx
		u[i] = p.ICPeak * math.Sin(math.Pi*x/p.L)
	}
	u[0] = 0.0
	u[nx-1] = 0.0

	uNew := make([]float64, nx)

	diverged := false
	divergeStep := 0

	for t := 0; t < steps; t++ {
		uNew[0] = 0.0
		uNew[nx-1] = 0.0
		for i := 1; i < nx-1; i++ {
			uNew[i] = u[i] + r*(u[i+1]-2.0*u[i]+u[i-1])
		}
		u, uNew = uNew, u

		// check divergence at center
		mid := u[nx/2]
		if math.IsNaN(mid) || math.IsInf(mid, 0) || math.Abs(mid) > 1e15 {
			diverged = true
			divergeStep = t
			break
		}
	}

	if diverged {
		return SimResult{
			Temperature: nil,
			Stable:      false,
			CFL:         r,
			NX:          nx,
			Steps:       steps,
			Alpha:       p.Alpha,
			L:           p.L,
			TFinal:      p.TFinal,
			ICPeak:      p.ICPeak,
			Dt:          p.Dt,
			Dx:          p.Dx,
			Message:     fmt.Sprintf("Diverged at step %d (r=%.4f > 0.5)", divergeStep, r),
		}
	}

	// build sampled profile (at most 300 points for the graph)
	sampleCount := nx
	if sampleCount > 300 {
		sampleCount = 300
	}
	xVals := make([]float64, sampleCount)
	uVals := make([]float64, sampleCount)
	for i := 0; i < sampleCount; i++ {
		// map sample index to grid index
		gi := int(math.Round(float64(i) * float64(nx-1) / float64(sampleCount-1)))
		if gi >= nx {
			gi = nx - 1
		}
		xVals[i] = float64(gi) * p.Dx
		uVals[i] = u[gi]
	}

	centerIdx := nx / 2
	temp := u[centerIdx]
	msg := "Stable"
	if !stable {
		msg = fmt.Sprintf("Unstable (r=%.4f > 0.5)", r)
	}

	return SimResult{
		Temperature: &temp,
		Profile:     uVals,
		XValues:     xVals,
		Stable:      stable,
		CFL:         r,
		NX:          nx,
		Steps:       steps,
		Alpha:       p.Alpha,
		L:           p.L,
		TFinal:      p.TFinal,
		ICPeak:      p.ICPeak,
		Dt:          p.Dt,
		Dx:          p.Dx,
		Message:     msg,
	}
}

func cors(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("JSON encode error: %v", err)
	}
}

func handleSimulate(w http.ResponseWriter, req *http.Request) {
	var err error
	var p SimParams

	p.Alpha, err = parseParam(req, "alpha", 0.001)
	if err != nil || p.Alpha <= 0 {
		http.Error(w, `{"error":"invalid alpha"}`, http.StatusBadRequest); return
	}
	p.L, err = parseParam(req, "L", 1.0)
	if err != nil || p.L <= 0 {
		http.Error(w, `{"error":"invalid L"}`, http.StatusBadRequest); return
	}
	p.TFinal, err = parseParam(req, "t_final", 2.0)
	if err != nil || p.TFinal <= 0 {
		http.Error(w, `{"error":"invalid t_final"}`, http.StatusBadRequest); return
	}
	p.ICPeak, err = parseParam(req, "ic_peak", 100.0)
	if err != nil {
		http.Error(w, `{"error":"invalid ic_peak"}`, http.StatusBadRequest); return
	}
	p.Dt, err = parseParam(req, "dt", 0.01)
	if err != nil || p.Dt <= 0 {
		http.Error(w, `{"error":"invalid dt"}`, http.StatusBadRequest); return
	}
	p.Dx, err = parseParam(req, "dx", 0.01)
	if err != nil || p.Dx <= 0 {
		http.Error(w, `{"error":"invalid dx"}`, http.StatusBadRequest); return
	}

	writeJSON(w, simulate(p))
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, map[string]string{"status": "ok"})
}

func main() {
	http.HandleFunc("/api/simulate", cors(handleSimulate))
	http.HandleFunc("/api/health", cors(handleHealth))

	log.Println("Heat Equation Simulator running on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
