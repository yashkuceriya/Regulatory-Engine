#!/bin/sh
set -e
echo "=== Cover Backend Starting ==="
echo "Python: $(python --version)"
echo "PORT: ${PORT:-not set}"
echo "PYTHONPATH: ${PYTHONPATH:-not set}"
echo "Testing imports..."
python -c "from backend.main import app; print('Imports OK')"
echo "Starting uvicorn on port ${PORT:-8000}..."
exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
