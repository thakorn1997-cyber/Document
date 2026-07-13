package storage

import (
	"fmt"
	"io"
)

type Storage interface {
	Save(relPath string, r io.Reader) (int64, error)
	Open(relPath string) (io.ReadCloser, error)
	Delete(relPath string) error
}

// New selects a storage backend by driver name. Only "local" is implemented today;
// any other value fails fast so a mis-set STORAGE_DRIVER can't silently fall back to
// local disk (which would look fine until files "disappear" on another node).
func New(driver, localPath string) (Storage, error) {
	switch driver {
	case "", "local":
		return NewLocal(localPath), nil
	default:
		return nil, fmt.Errorf("unsupported STORAGE_DRIVER %q (only \"local\" is implemented)", driver)
	}
}
