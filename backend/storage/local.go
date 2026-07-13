package storage

import (
	"io"
	"os"
	"path/filepath"
)

type Local struct {
	Root string
}

func NewLocal(root string) *Local {
	_ = os.MkdirAll(root, 0o755)
	return &Local{Root: root}
}

func (l *Local) full(rel string) string {
	return filepath.Join(l.Root, filepath.FromSlash(rel))
}

func (l *Local) Save(relPath string, r io.Reader) (int64, error) {
	full := l.full(relPath)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return 0, err
	}
	f, err := os.Create(full)
	if err != nil {
		return 0, err
	}
	defer f.Close()
	return io.Copy(f, r)
}

func (l *Local) Open(relPath string) (io.ReadCloser, error) {
	return os.Open(l.full(relPath))
}

func (l *Local) Delete(relPath string) error {
	return os.Remove(l.full(relPath))
}
