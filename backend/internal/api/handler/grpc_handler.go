package handler

// GrpcHandler is disabled for now as gRPC is being skipped.
type GrpcHandler struct {
}

func NewGrpcHandler() *GrpcHandler {
	return &GrpcHandler{}
}

// broadcastJobUpdate is assumed to be defined elsewhere or will be added if needed.
// For now, we keep the file valid but without gRPC dependencies.
