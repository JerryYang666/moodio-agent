package main

import "encoding/json"

// Federator abstracts cross-server message forwarding so the RoomManager
// can relay events between regional relay instances. When nil, the relay
// operates in single-server mode (backward compatible).
type Federator interface {
	Publish(roomId string, msg []byte) error
	Subscribe(roomId string, handler func(sourceRegion string, msg []byte)) error
	Unsubscribe(roomId string) error
	Close()
}

// FederatedMessage wraps a relayed message with the originating region ID
// so receiving servers can skip messages they themselves published.
type FederatedMessage struct {
	RegionID string          `json:"r"`
	Payload  json.RawMessage `json:"p"`
}

func encodeFederatedMsg(regionId string, payload []byte) ([]byte, error) {
	msg := FederatedMessage{
		RegionID: regionId,
		Payload:  json.RawMessage(payload),
	}
	return json.Marshal(msg)
}

func decodeFederatedMsg(data []byte) (FederatedMessage, error) {
	var msg FederatedMessage
	err := json.Unmarshal(data, &msg)
	return msg, err
}
