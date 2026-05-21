package main

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"strconv"
)

type SimulationRequest struct {
	P    [3][3]float64 `json:"p"`
	Days int           `json:"days"`
}

type SimulationResponse struct {
	History     []int     `json:"history"`
	Empirical   []float64 `json:"empirical"`
	Theoretical []float64 `json:"theoretical"`
}

var stateNames = []string{"Clear", "Cloudy", "Overcast"}
var latestHistory []int

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "index.html")
	})

	http.HandleFunc("/simulate", handleSimulate)
	http.HandleFunc("/download", handleDownload)

	fmt.Println("Server running on :8080")
	http.ListenAndServe(":8080", nil)
}

func validateTransitionMatrix(p [3][3]float64) string {
	for i := 0; i < 3; i++ {
		sum := 0.0
		for j := 0; j < 3; j++ {
			if p[i][j] < 0 || p[i][j] > 1 {
				return fmt.Sprintf("Row %d, column %d: value %f must be between 0 and 1", i+1, j+1, p[i][j])
			}
			sum += p[i][j]
		}
		if sum < 0.999 || sum > 1.001 {
			return fmt.Sprintf("Row %d probabilities sum to %f, must sum to 1.0", i+1, sum)
		}
	}
	return ""
}

func validateDays(days int) string {
	if days <= 0 {
		return "Number of days must be positive"
	}
	return ""
}

func handleSimulate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Invalid method", http.StatusMethodNotAllowed)
		return
	}

	var req SimulationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON body: "+err.Error(), http.StatusBadRequest)
		return
	}

	if errMsg := validateTransitionMatrix(req.P); errMsg != "" {
		http.Error(w, errMsg, http.StatusBadRequest)
		return
	}
	if errMsg := validateDays(req.Days); errMsg != "" {
		http.Error(w, errMsg, http.StatusBadRequest)
		return
	}

	// sim Markov Chain
	history := make([]int, req.Days)
	counts := []float64{0, 0, 0}
	currentState := 0 // start at clear

	for i := 0; i < req.Days; i++ {
		history[i] = currentState
		counts[currentState]++

		r := rand.Float64()
		p0 := req.P[currentState][0]
		p1 := req.P[currentState][1]

		if r < p0 {
			currentState = 0
		} else if r < p0+p1 {
			currentState = 1
		} else {
			currentState = 2
		}
	}

	empirical := []float64{
		counts[0] / float64(req.Days),
		counts[1] / float64(req.Days),
		counts[2] / float64(req.Days),
	}

	theoretical := solveStationary(req.P)
	latestHistory = history // save for csv export

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(SimulationResponse{
		History:     history,
		Empirical:   empirical,
		Theoretical: theoretical,
	})
}

// solves Pi * P = Pi, sum(Pi) = 1 using cramer's Rule
func solveStationary(p [3][3]float64) []float64 {
	a := [3][3]float64{
		{p[0][0] - 1, p[1][0], p[2][0]},
		{p[0][1], p[1][1] - 1, p[2][1]},
		{1, 1, 1},
	}
	b := [3]float64{0, 0, 1}

	detA := det3x3(a)
	if detA == 0 {
		return []float64{0.333, 0.333, 0.334} // fallback if singular
	}

	var pi [3]float64
	for i := 0; i < 3; i++ {
		tmp := a
		for j := 0; j < 3; j++ {
			tmp[j][i] = b[j]
		}
		pi[i] = det3x3(tmp) / detA
	}
	return pi[:]
}

func det3x3(m [3][3]float64) float64 {
	return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
		m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
		m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
}

func handleDownload(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment;filename=simulation_results.csv")

	writer := csv.NewWriter(w)
	defer writer.Flush()

	writer.Write([]string{"Day", "StateID", "StateName"})
	for day, state := range latestHistory {
		writer.Write([]string{strconv.Itoa(day + 1), strconv.Itoa(state + 1), stateNames[state]})
	}
}
