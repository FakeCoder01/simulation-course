package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
)

func withCORS(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h(w, r)
	}
}

func jsonResponse(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// part 1

type YesNoRequest struct {
	Probability float64 `json:"probability"` // p in [0,1]
	Question    string  `json:"question"`
}

type YesNoResponse struct {
	Question    string  `json:"question"`
	Answer      string  `json:"answer"`      // "YES" | "NO"
	Alpha       float64 `json:"alpha"`       // the random number α ∈ [0,1)
	Probability float64 `json:"probability"` // p chosen by user
	Triggered   bool    `json:"triggered"`   // α < p ?
}

func yesNoHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonResponse(
			w, http.StatusMethodNotAllowed, map[string]string{"error": "POST only"},
		)
		return
	}
	var req YesNoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(
			w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"},
		)
		return
	}
	if req.Probability < 0 || req.Probability > 1 {
		jsonResponse(
			w, http.StatusBadRequest,
			map[string]string{"error": "probability must be in [0,1]"},
		)
		return
	}

	alpha, _ := RngNext()
	triggered := alpha < req.Probability
	answer := "NO"
	if triggered {
		answer = "YES"
	}

	jsonResponse(w, http.StatusOK, YesNoResponse{
		Question:    req.Question,
		Answer:      answer,
		Alpha:       alpha,
		Probability: req.Probability,
		Triggered:   triggered,
	})
}

// part 2

// 20 classic Magic 8-Ball answers with equal probability 1/20 each.
// grouped by sentiment for UI coloring
var magic8Answers = []struct {
	Text      string `json:"text"`
	Sentiment string `json:"sentiment"` // "positive" | "neutral" | "negative"
}{
	{"It is certain", "positive"},
	{"It is decidedly so", "positive"},
	{"Without a doubt", "positive"},
	{"Yes, definitely", "positive"},
	{"You may rely on it", "positive"},
	{"As I see it, yes", "positive"},
	{"Most likely", "positive"},
	{"Outlook good", "positive"},
	{"Yes", "positive"},
	{"Signs point to yes", "positive"},
	{"Reply hazy, try again", "neutral"},
	{"Ask again later", "neutral"},
	{"Better not tell you now", "neutral"},
	{"Cannot predict now", "neutral"},
	{"Concentrate and ask again", "neutral"},
	{"Don't count on it", "negative"},
	{"My reply is no", "negative"},
	{"My sources say no", "negative"},
	{"Outlook not so good", "negative"},
	{"Very doubtful", "negative"},
}

type Magic8Request struct {
	Question string `json:"question"`
}

type Magic8Response struct {
	Question  string  `json:"question"`
	Answer    string  `json:"answer"`
	Sentiment string  `json:"sentiment"`
	Index     int     `json:"index"`     // k (0-based)
	Alpha     float64 `json:"alpha"`     // α from base generator
	Total     int     `json:"total"`     // m = 20
}

func magic8Handler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonResponse(
			w, http.StatusMethodNotAllowed,
			map[string]string{"error": "POST only"},
		)
		return
	}
	var req Magic8Request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}

	m := len(magic8Answers)
	alpha, _ := RngNext()
	// find k: first index where cumulative prob > alpha
	// since all probs are equal (1/m), k = floor(alpha * m)
	k := int(alpha * float64(m))
	if k >= m {
		k = m - 1
	}

	jsonResponse(w, http.StatusOK, Magic8Response{
		Question: req.Question,
		Answer: magic8Answers[k].Text,
		Sentiment: magic8Answers[k].Sentiment,
		Index: k,
		Alpha: alpha,
		Total: m,
	})
}


func healthHandler(w http.ResponseWriter, r *http.Request) {
	jsonResponse(
		w, http.StatusOK, map[string]any{
			"status": "ok",
			"time": time.Now().Format(time.RFC3339),
			"rng": "LCG drand48  a=25214903917  c=11  m=2^48",
			"rng_state": RngState(),
		},
	)
}


func main() {
	seed := uint64(time.Now().UnixNano())
	InitGlobalRng(seed)
	log.Printf("LCG initialised  seed=%d  a=25214903917  c=11  m=2^48", seed)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", withCORS(healthHandler))
	mux.HandleFunc("/api/yesno", withCORS(yesNoHandler))
	mux.HandleFunc("/api/magic8", withCORS(magic8Handler))

	log.Println("Backend listening on :8080")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatal(err)
	}
}
