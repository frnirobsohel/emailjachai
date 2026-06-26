package logger

import (
	"context"
	"os"
	"sync"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var (
	once sync.Once
	log  *zap.Logger
)

func Init() {
	once.Do(func() {
		var config zap.Config
		// Use GO_ENV for consistency; also accept ENVIRONMENT for backward compatibility
		env := os.Getenv("GO_ENV")
		if env == "" {
			env = os.Getenv("ENVIRONMENT")
		}
		if env == "production" {
			config = zap.NewProductionConfig()
			config.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
		} else {
			config = zap.NewDevelopmentConfig()
			config.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
		}

		var err error
		log, err = config.Build(zap.AddCaller(), zap.AddCallerSkip(1))
		if err != nil {
			panic(err)
		}
	})
}

func Info(msg string, args ...any) {
	if log == nil {
		Init()
	}
	log.Sugar().Infow(msg, args...)
}

func Error(msg string, args ...any) {
	if log == nil {
		Init()
	}
	log.Sugar().Errorw(msg, args...)
}

func Warn(msg string, args ...any) {
	if log == nil {
		Init()
	}
	log.Sugar().Warnw(msg, args...)
}

func Debug(msg string, args ...any) {
	if log == nil {
		Init()
	}
	log.Sugar().Debugw(msg, args...)
}

func Fatal(msg string, args ...any) {
	if log == nil {
		Init()
	}
	log.Sugar().Fatalw(msg, args...)
}

func With(args ...any) *zap.SugaredLogger {
	if log == nil {
		Init()
	}
	return log.Sugar().With(args...)
}

func InfoContext(ctx context.Context, msg string, args ...any) {
	if log == nil {
		Init()
	}
	log.Sugar().Infow(msg, args...)
}

func ErrorContext(ctx context.Context, msg string, args ...any) {
	if log == nil {
		Init()
	}
	log.Sugar().Errorw(msg, args...)
}



