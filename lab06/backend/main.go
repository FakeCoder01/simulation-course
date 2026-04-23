package main

import (
	"encoding/json"
	"math"
	"math/rand"
	"net/http"
	"time"
)

// precomputed Chi-Square critical values for alpha = 0.05
var chiSquareCritical = map[int]float64{
	1: 3.841, 2: 5.991, 3: 7.815, 4: 9.488, 5: 11.070,
	6: 12.592, 7: 14.067, 8: 15.507, 9: 16.919, 10: 18.307,
}

func getCriticalValue(df int) float64 {
	if val, ok := chiSquareCritical[df]; ok {
		return val
	}
	return float64(df) // fallback approx for large df
}

type DiscreteReq struct {
	Probs []float64 `json:"probs"`
	N     int       `json:"n"`
}

type NormalReq struct {
	Mean     float64 `json:"mean"`
	Variance float64 `json:"variance"`
	N        int     `json:"n"`
}

func main() {
	rand.Seed(time.Now().UnixNano())

	http.HandleFunc("/api/discrete", corsMiddleware(discreteHandler))
	http.HandleFunc("/api/normal", corsMiddleware(normalHandler))

	http.ListenAndServe(":8080", nil)
}

func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}

func discreteHandler(w http.ResponseWriter, r *http.Request) {
	var req DiscreteReq
	json.NewDecoder(r.Body).Decode(&req)

	n := req.N
	counts := make([]int, len(req.Probs))

	// sim
	for i := 0; i < n; i++ {
		u := rand.Float64()
		sum := 0.0
		for j, p := range req.Probs {
			sum += p
			if u < sum {
				counts[j]++
				break
			}
		}
	}

	empFreqs := make([]float64, len(req.Probs))
	var empMean, theorMean, empVar, theorVar float64

	for i := range req.Probs {
		val := float64(i + 1)
		empFreqs[i] = float64(counts[i]) / float64(n)
		theorMean += val * req.Probs[i]
		empMean += val * empFreqs[i]
	}

	for i := range req.Probs {
		val := float64(i + 1)
		theorVar += req.Probs[i] * math.Pow(val-theorMean, 2)
		empVar += empFreqs[i] * math.Pow(val-empMean, 2)
	}

	var chiSq float64
	for i := range req.Probs {
		expected := float64(n) * req.Probs[i]
		if expected > 0 {
			chiSq += math.Pow(float64(counts[i])-expected, 2) / expected
		}
	}

	meanErr := math.Abs(empMean-theorMean) / theorMean * 100
	varErr := math.Abs(empVar-theorVar) / theorVar * 100
	df := len(req.Probs) - 1
	critVal := getCriticalValue(df)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"frequencies": empFreqs,
		"mean":        empMean,
		"meanErr":     meanErr,
		"variance":    empVar,
		"varErr":      varErr,
		"chiSq":       chiSq,
		"critVal":     critVal,
		"passed":      chiSq <= critVal,
	})
}

func normalHandler(w http.ResponseWriter, r *http.Request) {
	var req NormalReq
	json.NewDecoder(r.Body).Decode(&req)

	n := req.N
	stdDev := math.Sqrt(req.Variance)
	values := make([]float64, n)

	var sum, sumSq float64

	// box-muller Simulation
	for i := 0; i < n; i++ {
		u1 := rand.Float64()
		u2 := rand.Float64()
		z0 := math.Sqrt(-2.0*math.Log(u1)) * math.Cos(2.0*math.Pi*u2)
		val := req.Mean + stdDev*z0
		values[i] = val
		sum += val
		sumSq += val * val
	}

	empMean := sum / float64(n)
	empVar := (sumSq / float64(n)) - (empMean * empMean)

	meanErr := math.Abs(empMean-req.Mean) / math.Abs(req.Mean) * 100
	if req.Mean == 0 {
		meanErr = math.Abs(empMean) * 100
	}
	varErr := math.Abs(empVar-req.Variance) / req.Variance * 100


	k := int(math.Ceil(1 + 3.322*math.Log10(float64(n))))
	if k < 5 { k = 5 } else if k > 20 { k = 20 }

	min, max := values[0], values[0]
	for _, v := range values {
		if v < min { min = v }
		if v > max { max = v }
	}

	binWidth := (max - min) / float64(k)
	counts := make([]int, k)
	labels := make([]float64, k)

	for i := 0; i < k; i++ {
		labels[i] = min + float64(i)*binWidth + binWidth/2
	}

	for _, v := range values {
		idx := int((v - min) / binWidth)
		if idx >= k { idx = k - 1 }
		counts[idx]++
	}

	empFreqs := make([]float64, k)
	theorCurve := make([]float64, k)
	var chiSq float64

	for i := 0; i < k; i++ {
		empFreqs[i] = float64(counts[i]) / float64(n)

		// theoretical prob for the interval
		a := min + float64(i)*binWidth
		b := a + binWidth
		p := normCDF(b, req.Mean, stdDev) - normCDF(a, req.Mean, stdDev)
		theorCurve[i] = p

		expected := float64(n) * p
		if expected > 0 {
			chiSq += math.Pow(float64(counts[i])-expected, 2) / expected
		}
	}

	df := k - 3
	if df < 1 { df = 1 }
	critVal := getCriticalValue(df)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"labels":     labels,
		"frequencies": empFreqs,
		"curve":      theorCurve,
		"mean":       empMean,
		"meanErr":    meanErr,
		"variance":   empVar,
		"varErr":     varErr,
		"chiSq":      chiSq,
		"critVal":    critVal,
		"passed":     chiSq <= critVal,
	})
}

// approx of normal CDF
func normCDF(x, mean, stdDev float64) float64 {
	return 0.5 * (1 + math.Erf((x-mean)/(stdDev*math.Sqrt2)))
}
