#!/usr/bin/env bash
# 运行林逸小说家大脑 Agent（Mock LLM 快速测试模式）
set -e

cd "$(dirname "$0")"

if [[ ! -d .venv ]]; then
    echo "创建虚拟环境..."
    python3 -m venv .venv
fi

source .venv/bin/activate

if ! python -c "import fastapi, uvicorn" 2>/dev/null; then
    echo "安装依赖..."
    pip install -r requirements.txt
fi

exec python main.py \
    --use-mock \
    --fast-forward \
    --days 1 \
    --disable-webui \
    "$@"
