package main

import (
	"sync"
	"time"

	"github.com/nats-io/nats.go"
)

// NATSFederator implements Federator using NATS pub/sub.
// Each relay server connects to its local NATS node; cross-region
// forwarding is handled transparently by NATS gateways.
type NATSFederator struct {
	conn     *nats.Conn
	regionId string
	subs     map[string]*nats.Subscription
	mu       sync.Mutex
}

func NewNATSFederator(url, regionId string) (*NATSFederator, error) {
	nc, err := nats.Connect(url,
		nats.Name("moodio-relay-"+regionId),
		nats.ReconnectWait(2*time.Second),
		nats.MaxReconnects(-1),
		nats.DisconnectErrHandler(func(_ *nats.Conn, err error) {
		logf(regionLocal, "[nats] disconnected: %v", err)
		}),
		nats.ReconnectHandler(func(nc *nats.Conn) {
		logf(regionLocal, "[nats] reconnected to %s", nc.ConnectedUrl())
		}),
	)
	if err != nil {
		return nil, err
	}
	logf(regionLocal, "[nats] connected to %s (region=%s)", nc.ConnectedUrl(), regionId)
	return &NATSFederator{
		conn:     nc,
		regionId: regionId,
		subs:     make(map[string]*nats.Subscription),
	}, nil
}

func (f *NATSFederator) Publish(roomId string, msg []byte) error {
	data, err := encodeFederatedMsg(f.regionId, msg)
	if err != nil {
		return err
	}
	return f.conn.Publish("room."+roomId, data)
}

func (f *NATSFederator) Subscribe(roomId string, handler func(string, []byte)) error {
	sub, err := f.conn.Subscribe("room."+roomId, func(m *nats.Msg) {
		fm, err := decodeFederatedMsg(m.Data)
		if err != nil {
			logf(regionLocal, "[nats] bad federated message: %v", err)
			return
		}
		if fm.RegionID == f.regionId {
			return
		}
		handler(fm.RegionID, fm.Payload)
	})
	if err != nil {
		return err
	}
	f.mu.Lock()
	f.subs[roomId] = sub
	f.mu.Unlock()
	return nil
}

func (f *NATSFederator) Unsubscribe(roomId string) error {
	f.mu.Lock()
	sub, ok := f.subs[roomId]
	delete(f.subs, roomId)
	f.mu.Unlock()
	if ok {
		return sub.Unsubscribe()
	}
	return nil
}

func (f *NATSFederator) Close() {
	f.conn.Close()
}
