package main

import "testing"

func TestDisplayNameFallback(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		firstName string
		email     string
		want      string
	}{
		{
			name:      "uses first name when present",
			firstName: "Alice",
			email:     "alice@example.com",
			want:      "Alice",
		},
		{
			name:      "falls back to email when first name missing",
			firstName: "",
			email:     "alice@example.com",
			want:      "alice@example.com",
		},
		{
			name:      "falls back to email when first name is whitespace",
			firstName: "   ",
			email:     "alice@example.com",
			want:      "alice@example.com",
		},
		{
			name:      "uses placeholder when both missing",
			firstName: "",
			email:     " ",
			want:      "unknown-user",
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := displayName(tt.firstName, tt.email)
			if got != tt.want {
				t.Fatalf("displayName(%q, %q) = %q, want %q", tt.firstName, tt.email, got, tt.want)
			}
		})
	}
}
