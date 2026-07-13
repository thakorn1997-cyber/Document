package notify

import (
	"sync"
)

// Hub is an in-memory pub/sub for Server-Sent Events.
// Each userID maps to a list of subscriber channels (one per open SSE tab).
type Hub struct {
	mu   sync.RWMutex
	subs map[string]map[chan []byte]struct{}
}

func NewHub() *Hub {
	return &Hub{subs: make(map[string]map[chan []byte]struct{})}
}

// Subscribe returns a channel that receives events for the given user.
// Caller must call Unsubscribe when done.
func (h *Hub) Subscribe(userID string) chan []byte {
	ch := make(chan []byte, 8)
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.subs[userID]; !ok {
		h.subs[userID] = make(map[chan []byte]struct{})
	}
	h.subs[userID][ch] = struct{}{}
	return ch
}

func (h *Hub) Unsubscribe(userID string, ch chan []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	set, ok := h.subs[userID]
	if !ok {
		return
	}
	if _, ok := set[ch]; ok {
		delete(set, ch)
		close(ch)
	}
	if len(set) == 0 {
		delete(h.subs, userID)
	}
}

// Publish sends the event to all active subscribers of a user (non-blocking; drops if channel full).
func (h *Hub) Publish(userID string, data []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for ch := range h.subs[userID] {
		select {
		case ch <- data:
		default:
			// buffer full — drop this event for that tab
		}
	}
}
