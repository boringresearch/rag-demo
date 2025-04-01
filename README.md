# My Open RAG Project

A FastAPI application that demonstrates **Retrieval-Augmented Generation (RAG)** concepts, combining:
- Audio/Video transcription via [AssemblyAI](https://www.assemblyai.com/),
- Semantic search over text sections with [FAISS](https://github.com/facebookresearch/faiss),
- Optional usage of LLaMA-based embeddings or a **fake** embeddings class.

## Features

- **Upload or record** audio/video, transcribe with AssemblyAI, and get `SRT`/`VTT` subtitles.
- **Semantic Search** over the transcribed text or your own documents (markdown-based).
- **Modular** design following clean code principles, with separate classes for embeddings, search, and server.
- **Flexible Embeddings** with support for llama.cpp or custom embedding providers.

## Installation

1. **Clone** this repository:
    ```bash
    git clone https://github.com/YourUserName/my-open-rag-project.git
    cd my-open-rag-project
    ```

2. **Create and activate** a virtual environment (recommended):
    ```bash
    python -m venv venv
    source venv/bin/activate  # on Linux/Mac
    .\venv\Scripts\activate   # on Windows
    ```

3. **Install requirements**:
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

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

This project is licensed under the [MIT License](LICENSE).

## Code of Conduct

We've adopted a Code of Conduct to ensure a welcoming community. Please see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
