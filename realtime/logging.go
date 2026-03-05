package main

import (
	"fmt"
	"log"
)

const regionLocal = "local"

func logf(region, format string, args ...any) {
	log.Printf("[%s] %s", region, fmt.Sprintf(format, args...))
}

func fatalf(region, format string, args ...any) {
	log.Fatalf("[%s] %s", region, fmt.Sprintf(format, args...))
}
