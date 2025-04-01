import uvicorn
from server.app import create_app

def main():
    """
    Entry point to run the RAG FastAPI application.
    """
    app = create_app()
    uvicorn.run(app, host="0.0.0.0", port=8002)

if __name__ == "__main__":
    main()
