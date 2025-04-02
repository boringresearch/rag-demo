import numpy as np
from typing import List
import requests
import json

from .base import EmbeddingsBase

class LlamaEmbeddings(EmbeddingsBase):
    """
    LLaMA embedding class that calls the llama.cpp server API endpoint
    to obtain embeddings for the input texts.
    """
    def __init__(self, api_url: str):
        self.api_url = api_url

    def encode(self, texts: List[str]) -> np.ndarray:
        """
        Call the llama.cpp server API for each text. Returns an (N x D) array of embeddings.
        
        The llama.cpp server expects requests in the format:
        POST /embedding
        {
            "content": "text to embed"
        }
        """
        embeddings = []
        for text in texts:
            try:
                # Format payload according to llama.cpp server API
                payload = {"content": text}
                
                # Make the API request
                response = requests.post(f"{self.api_url}/embedding", json=payload)
                response.raise_for_status()
                
                # Parse the response
                data = response.json()
                if "embedding" in data:
                    embeddings.append(data["embedding"])
                else:
                    # Handle case where response format is different
                    print(f"[LlamaEmbeddings] Warning: Unexpected response format: {data}")
                    if isinstance(data, list) and len(data) > 0:
                        embeddings.append(data)
                    else:
                        raise ValueError(f"Could not extract embedding from response: {data}")
            except Exception as e:
                print(f"[LlamaEmbeddings] Error getting embedding for text: {str(e)}")
                # Fallback to a zero vector if there's an error
                if embeddings:
                    # Use same dimension as previous embeddings
                    embeddings.append(np.zeros_like(embeddings[0]))
                else:
                    # Default to 384 dimensions if no previous embeddings
                    embeddings.append(np.zeros(384))
                
        return np.array(embeddings, dtype=np.float32)
