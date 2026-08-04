package queue

import (
	"sync"

	"ejp-worker/pkg/config"
)

// workerTaskGate limits concurrent chunk verification using Job Control worker_concurrency.
type workerTaskGate struct {
	mu     sync.Mutex
	cond   *sync.Cond
	active int
}

func newWorkerTaskGate() *workerTaskGate {
	g := &workerTaskGate{}
	g.cond = sync.NewCond(&g.mu)
	return g
}

func (g *workerTaskGate) Acquire() {
	g.mu.Lock()
	defer g.mu.Unlock()
	for {
		limit := config.GetEffectiveWorkerConcurrency()
		if g.active < limit {
			g.active++
			return
		}
		g.cond.Wait()
	}
}

func (g *workerTaskGate) Release() {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.active > 0 {
		g.active--
	}
	g.cond.Broadcast()
}

var chunkVerifyGate = newWorkerTaskGate()
