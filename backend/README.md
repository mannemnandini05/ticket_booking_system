# SmartEvent Backend

Run with:

```bash
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The service uses SQLite and creates its schema and sample events on startup.
