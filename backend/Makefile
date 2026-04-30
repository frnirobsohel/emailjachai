.PHONY: build run tidy clean

BINARY_NAME=api.exe

build:
	go build -o $(BINARY_NAME) cmd/api/main.go

run: build
	./$(BINARY_NAME)

tidy:
	go mod tidy

clean:
	rm -f $(BINARY_NAME)
	go clean
