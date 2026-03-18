# AI Summaries

Optional Ollama integration for intelligent search result summaries.

> **Navigation:** [Documentation](../README.md) > [Features](README.md) > [AI Summaries](ai-summaries.md)

---

## Overview

SearchBox can generate **AI-powered summaries** of your search results using Ollama:

- 🧠 **Intelligent summaries** — Understand documents without opening them
- 📝 **Streaming output** — Real-time text generation
- 🔒 **100% local** — Runs on your machine, no external APIs
- ⚡ **Multiple models** — Choose from Llama, Gemma, Mistral, etc.
- 🎯 **Context-aware** — Summarizes based on your search query

---

## Prerequisites

### Install Ollama

**Linux/macOS:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Windows:**
Download from [ollama.com](https://ollama.com)

### Pull a Model

```bash
# Recommended: Gemma 3 (12B)
ollama pull gemma3:12b

# Alternative: Llama 3.1 (8B)
ollama pull llama3.1:8b

# Alternative: Mistral (7B)
ollama pull mistral:7b
```

### Start Ollama

```bash
ollama serve
```

Ollama runs on `http://localhost:11434` by default.

---

## Enable AI Summaries

### Step 1: Open Settings

Navigate to **Settings** → **AI Search**

### Step 2: Enable AI Search

Toggle **Enable AI Search** switch

### Step 3: Configure Ollama

- **Ollama URL:** `http://localhost:11434` (Docker: `http://host.docker.internal:11434`)
- **Model:** Select from dropdown (auto-detected)
- **Timeout:** 30 seconds (adjustable)

### Step 4: Test Connection

Click **Test Connection** to verify Ollama is running.

### Step 5: Save

Click **Save Changes**

---

## Using AI Summaries

### Automatic Summaries

When AI search is enabled, SearchBox automatically generates summaries for search results.

**Example:**
1. Search for "quarterly report"
2. Results appear
3. AI summary streams below search results
4. Summary explains which documents match your query

### Summary Content

AI summaries include:
- **Document relevance** — Why each result matches
- **Key information** — Important points from documents
- **Context** — How documents relate to your query
- **Recommendations** — Which document to open first

---

## Model Recommendations

| Model | Size | Speed | Quality | Best For |
|-------|------|-------|--------|----------|
| **gemma3:12b** | 12B | Medium | Excellent | General use, balanced |
| **llama3.1:8b** | 8B | Fast | Good | Quick summaries |
| **mistral:7b** | 7B | Fast | Good | Fast, efficient |
| **codellama:34b** | 34B | Slow | Excellent | Code-heavy docs |
| **mixtral:8x7b** | 47B | Slow | Excellent | Complex documents |

**Recommended:** `gemma3:12b` for best balance of speed and quality.

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API URL |
| `OLLAMA_MODEL` | `gemma3:12b` | Default model |
| `OLLAMA_TIMEOUT` | `30` | Request timeout (seconds) |

### Docker Configuration

If running SearchBox in Docker, use:

```yaml
# docker-compose.yml
environment:
  - OLLAMA_URL=http://host.docker.internal:11434
```

Or on Linux:
```yaml
environment:
  - OLLAMA_URL=http://172.17.0.1:11434
```

---

## Performance

### Speed

| Model | Documents | Summary Time |
|-------|-----------|--------------|
| gemma3:12b | 5 results | ~3-5 seconds |
| llama3.1:8b | 5 results | ~2-4 seconds |
| mistral:7b | 5 results | ~1-3 seconds |

### Optimization Tips

- Use smaller models (7B-8B) for faster summaries
- Reduce timeout if model is slow
- Use GPU if available (Ollama auto-detects)
- Limit number of results to summarize

---

## Troubleshooting

### Ollama Not Running

**Symptom:** "Connection refused" error

**Solution:**
```bash
# Start Ollama
ollama serve

# Check status
curl http://localhost:11434/api/tags
```

### Model Not Found

**Symptom:** "Model not found" error

**Solution:**
```bash
# Pull model
ollama pull gemma3:12b

# List models
ollama list
```

### Slow Summaries

**Symptom:** Summaries take >30 seconds

**Solution:**
- Use smaller model (gemma3:8b, mistral:7b)
- Increase timeout in Settings
- Check GPU availability
- Close other applications

### Docker Connection Issues

**Symptom:** Docker can't connect to Ollama

**Solution:**
- Use `host.docker.internal:11434` (macOS/Windows)
- Use `172.17.0.1:11434` (Linux)
- Ensure Ollama is running on host

---

## Privacy

### Data Flow

```
SearchBox → Ollama (localhost) → AI Model → Summary
     ↓
(Nothing leaves your machine)
```

### What's Sent to Ollama

- Search query
- Document titles
- Document excerpts (truncated)
- Request to summarize

### What's NOT Sent

- Full document content
- File paths
- User identifiers
- Any external services

**Ollama runs entirely locally. Nothing is sent to external servers.**

---

## API Reference

### Check AI Status

```bash
GET /api/ollama/status
```

**Response:**
```json
{
  "enabled": true,
  "connected": true,
  "model": "gemma3:12b",
  "models_available": 3
}
```

### Get Available Models

```bash
GET /api/ollama/models
```

**Response:**
```json
{
  "models": ["gemma3:12b", "llama3.1:8b", "mistral:7b"],
  "count": 3
}
```

### Generate Summary

```bash
POST /api/search/summary
Content-Type: application/json

{
  "query": "quarterly report",
  "results": ["doc1", "doc2", "doc3"]
}
```

### Stream Summary

```bash
POST /api/search/summary/stream
Content-Type: application/json

{
  "query": "quarterly report",
  "results": ["doc1", "doc2", "doc3"]
}
```

Returns Server-Sent Events (SSE) stream.

---

## Advanced Usage

### Custom Prompts

Modify summary prompts in Settings:
1. Settings → AI Search
2. Advanced → Custom Prompt
3. Enter custom prompt template

### Temperature Control

Adjust creativity (0.0-1.0):
- **0.0-0.3**: Factual, accurate
- **0.4-0.7**: Balanced
- **0.8-1.0**: Creative, varied

### Batch Processing

Summarize multiple queries:
```bash
for query in "report" "budget" "plan"; do
  curl -X POST http://localhost:5000/api/search/summary \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"$query\"}"
done
```

---

## Limitations

- **Model size:** Larger models require more RAM
- **Speed:** GPU acceleration recommended
- **Context window:** Limited by model context size
- **Language:** Most models work best with English
- **Accuracy:** Summaries may miss nuances

---

## Best Practices

1. **Use appropriate model** — Smaller for speed, larger for quality
2. **Limit results** — Summarize 3-5 documents, not all
3. **Be specific** — Focused queries yield better summaries
4. **Test locally first** — Verify Ollama works before Docker
5. **Monitor resources** — AI uses CPU/GPU heavily

---

## Related Features

- **[Search](search.md)** — Search capabilities
- **[Vault](vault.md)** — Encrypted storage
- **[Architecture](../architecture/overview.md)** — System design

---

**Previous:** [Bookmarks](bookmarks.md)  
**Next:** [Folder Indexing](folder-indexing.md)