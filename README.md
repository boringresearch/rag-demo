# RAG Document

A FastAPI application that demonstrates **Retrieval-Augmented Generation (RAG)** concepts, combining:
- Audio/Video transcription via [AssemblyAI](https://www.assemblyai.com/),
- Semantic search over text sections with [FAISS](https://github.com/facebookresearch/faiss),
- Optional usage of LLaMA-based embeddings or a **fake** embeddings class.

<img width="971" alt="截屏2025-04-02 01 09 57" src="https://github.com/user-attachments/assets/0eaaf9e7-4150-4cb5-b5ac-040d636942ed" />

## Features

- **Upload or record** audio/video, transcribe with AssemblyAI, and get `SRT`/`VTT` subtitles.
- **Semantic Search** over the transcribed text or your own documents (markdown-based).
- **Modular** design following clean code principles, with separate classes for embeddings, search, and server.
- **Flexible Embeddings** with support for llama.cpp or custom embedding providers.

## Installation

1. **Clone** this repository:
    ```bash
    git clone https://github.com/boringresearch/rag-demo.git
    cd rag-demo
    ```

2. **Create and activate** a virtual environment (recommended):
    ```bash
    python -m venv venv
    source venv/bin/activate  # on Linux/Mac
    .\venv\Scripts\activate   # on Windows
    ```

3. **Install requirements (python<=3.11)**:
    ```bash
    pip install -r requirements.txt
    ```

4. **Configure environment**:
    - Copy `.env.example` to `.env`
    - Insert your `ASSEMBLYAI_API_KEY` inside `.env`
    - Configure your embedding API URL in `.env` if using a custom embedding service

5. **Run** the application:
    ```bash
    python src/main.py
    ```
    - Server listens on [http://localhost:8002](http://localhost:8002)

## Usage

- Open your browser at [http://localhost:8002](http://localhost:8002).
- Upload an audio/video file or choose an example to see transcription.
- Type a query in the search box to perform semantic search over the transcribed content or custom text.

## Embeddings with llama.cpp

This project uses [llama.cpp](https://github.com/ggerganov/llama.cpp) for generating embeddings by default. To set up the embedding server:

1. **Install llama.cpp** following the instructions in their repository
2. **Download a compatible model** (e.g., a GGUF format model)
3. **Run the llama-server** with embeddings enabled:
   ```bash
   ./llama-server -m model-f16.gguf --embeddings -c 512 -ngl 99 --host 0.0.0.0
   ```
4. **Update your `.env` file** with the correct embedding API URL (default: `http://localhost:8080`)

### llama.cpp Embedding API Format

The llama.cpp server expects embedding requests in the following format:

```json
POST /embedding
{
    "content": "text to embed"
}
```

The response will contain the embedding vector:

```json
{
    "embedding": [0.123, 0.456, ...]
}
```

### Troubleshooting Embeddings

If you encounter issues with the embedding API:

1. **Check that the llama-server is running** with the `--embeddings` flag
2. **Verify the API URL** in your `.env` file matches the server address
3. **Test the API directly** using curl:
   ```bash
   curl -X POST http://localhost:8080/embedding \
     -H "Content-Type: application/json" \
     -d '{"content":"test text"}'
   ```
4. **Check server logs** for any error messages
5. **Try using the FakeEmbeddings provider** for testing by setting `EMBEDDING_PROVIDER=fake` in your `.env` file

### Using Alternative Embedding Providers

The project is designed to make it easy to switch between different embedding providers:

1. Create a new class that implements the `EmbeddingsBase` interface in `src/embeddings/`
2. Update the `TermsSearchEngine` initialization in `src/server/app.py` to use your custom embeddings class
3. Alternatively, set the `EMBEDDING_PROVIDER` environment variable to switch between implemented providers

## Project Structure

```
my-open-rag-project/
├── LICENSE
├── README.md
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── requirements.txt
├── .env.example
├── src/
│   ├── main.py
│   ├── server/
│   │   ├── __init__.py
│   │   └── app.py
│   ├── embeddings/
│   │   ├── __init__.py
│   │   ├── base.py
│   │   ├── fake.py
│   │   └── llama.py
│   ├── search/
│   │   ├── __init__.py
│   │   └── terms_search_engine.py
│   └── templates/
│       └── index.html
├── static/
├── cache/
├── examples/
└── uploads/
```

## License

This project is licensed under the [MIT License](LICENSE).

## Code of Conduct

We've adopted a Code of Conduct to ensure a welcoming community. Please see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
