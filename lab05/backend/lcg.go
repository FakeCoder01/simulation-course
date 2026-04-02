package main

import "sync"


type LcgRng struct {
	state uint64
	a     uint64
	c     uint64
	m     uint64
}


func NewLcgRng(seed, a, c, m uint64) *LcgRng {
	return &LcgRng{
		state: seed,
		a: a,
		c: c,
		m: m,
	}
}

func NewLcgDrand48(seed uint64) *LcgRng {
	return &LcgRng{
		state: seed,
		a:     25214903917,
		c:     11,
		m:     1 << 48,
	}
}

func (r *LcgRng) NextF64() float64 {
	r.state = (r.a*r.state + r.c) % r.m
	return float64(r.state) / float64(r.m)
}

func (r *LcgRng) State() uint64 { return r.state }

var (
	globalRng   *LcgRng
	globalRngMu sync.Mutex
)

func InitGlobalRng(seed uint64) {
	globalRngMu.Lock()
	defer globalRngMu.Unlock()
	globalRng = NewLcgDrand48(seed)
}

func RngNext() (alpha float64, rawState uint64) {
	globalRngMu.Lock()
	defer globalRngMu.Unlock()
	alpha = globalRng.NextF64()
	rawState = globalRng.State()
	return
}

func RngState() uint64 {
	globalRngMu.Lock()
	defer globalRngMu.Unlock()
	return globalRng.State()
}
