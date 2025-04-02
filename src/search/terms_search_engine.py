import os
import pickle
import faiss
import numpy as np
from dataclasses import dataclass
from typing import List, Dict, Union, Optional, Type

from embeddings.base import EmbeddingsBase
from embeddings.llama import LlamaEmbeddings
from embeddings.fake import FakeEmbeddings

@dataclass
class TermSection:
    """
    A single section of text with a title, content, and position in the original text.
    """
    section_id: int
    content: str
    title: str
    start_idx: int
    end_idx: int

class TermsSearchEngine:
    """
    A class for building and querying a FAISS index of text sections.
    """

    def __init__(self, 
                 embedding_api_url: str = "http://localhost:8080", 
                 cache_dir: str = "cache",
                 embedding_provider: str = "llama",
                 embedding_dimension: int = 384):
        """
        Initialize the search engine with a configurable embedding model
        and optional cache directory for storing the FAISS index and sections.
        
        Args:
            embedding_api_url: URL for the embedding API (used by LlamaEmbeddings)
            cache_dir: Directory to store cached index and sections
            embedding_provider: Which embedding provider to use ('llama' or 'fake')
            embedding_dimension: Dimension of embeddings (only used for FakeEmbeddings)
        """
        self.embedding_model: EmbeddingsBase = self._get_embedding_model(
            provider=embedding_provider,
            api_url=embedding_api_url,
            dimension=embedding_dimension
        )
        self.cache_dir = cache_dir
        os.makedirs(self.cache_dir, exist_ok=True)

        self.index: Optional[faiss.Index] = None
        self.sections: List[TermSection] = []
        self.original_text: str = ""

    def _get_embedding_model(self, provider: str, api_url: str, dimension: int) -> EmbeddingsBase:
        """
        Factory method to create the appropriate embedding model based on the provider.
        
        Args:
            provider: The embedding provider to use ('llama' or 'fake')
            api_url: URL for the embedding API (used by LlamaEmbeddings)
            dimension: Dimension of embeddings (only used for FakeEmbeddings)
            
        Returns:
            An instance of a class implementing EmbeddingsBase
        """
        provider = provider.lower()
        if provider == "llama":
            # Try to connect to the llama.cpp server, fall back to FakeEmbeddings if not available
            try:
                import requests
                # Test connection with a simple request
                response = requests.get(f"{api_url}/health", timeout=2)
                if response.status_code == 200:
                    print(f"[TermsSearchEngine] Successfully connected to llama.cpp server at {api_url}")
                    return LlamaEmbeddings(api_url)
                else:
                    print(f"[TermsSearchEngine] Warning: llama.cpp server returned status code {response.status_code}")
            except Exception as e:
                print(f"[TermsSearchEngine] Warning: Could not connect to llama.cpp server at {api_url}: {str(e)}")
                print("[TermsSearchEngine] Falling back to FakeEmbeddings")
            
            # If we get here, there was an issue connecting to the server
            return FakeEmbeddings(dimension)
        elif provider == "fake":
            return FakeEmbeddings(dimension)
        else:
            print(f"[TermsSearchEngine] Unknown provider '{provider}', falling back to FakeEmbeddings")
            return FakeEmbeddings(dimension)

    def build_index(self, markdown_path: str) -> None:
        """
        Build and save a FAISS index from a local markdown file.
        """
        print(f"[TermsSearchEngine] Reading markdown file: {markdown_path}")
        with open(markdown_path, "r", encoding="utf-8") as f:
            content = f.read()

        print("[TermsSearchEngine] Splitting content into sections...")
        self.sections = self._split_into_sections(content)

        texts = [sec.content for sec in self.sections]
        embeddings = self.embedding_model.encode(texts)

        print("[TermsSearchEngine] Creating FAISS index...")
        self.index = self._create_index(embeddings)

        print("[TermsSearchEngine] Saving index to cache...")
        self._save_state()
        print("[TermsSearchEngine] Index build complete.")

    def process_text(self, text: str) -> None:
        """
        Build an index directly from a user-provided text (instead of a file).
        Useful for on-the-fly indexing.
        """
        self.sections.clear()
        self.index = None
        self.original_text = text

        self.sections = self._split_into_sections(text)
        if not self.sections:
            print("[TermsSearchEngine] Warning: no sections created!")
            return

        embeddings = self.embedding_model.encode([s.content for s in self.sections])
        self.index = self._create_index(embeddings)
        print("[TermsSearchEngine] In-memory index created.")

    def load_state(self) -> bool:
        """
        Load index and sections from the cache directory, if they exist.
        Returns True if successful, else False.
        """
        cache_path = os.path.join(self.cache_dir, "terms_search")
        index_file = f"{cache_path}.index"
        pkl_file = f"{cache_path}.pkl"

        if os.path.exists(index_file) and os.path.exists(pkl_file):
            self.index = faiss.read_index(index_file)
            with open(pkl_file, "rb") as f:
                state = pickle.load(f)
                self.sections = state["sections"]
                self.original_text = state["original_text"]
            print("[TermsSearchEngine] Successfully loaded state from cache.")
            return True

        return False

    def search(self, query: str, k: int = 3) -> List[Dict]:
        """
        Perform semantic search for similar sections given a query.
        Returns a list of dictionaries containing the matched sections.
        """
        if not self.index:
            raise ValueError("[TermsSearchEngine] Error: Index not built yet.")

        print(f"[TermsSearchEngine] Searching for: {query}")
        # Convert query into embeddings
        query_embedding = self.embedding_model.encode([query])

        # Normalize query embedding
        faiss.normalize_L2(query_embedding)

        # Search
        distances, indices = self.index.search(query_embedding, k)
        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if 0 <= idx < len(self.sections):
                section = self.sections[idx]
                results.append({
                    "content": section.content,
                    "similarity": float(dist),
                    "title": section.title,
                    "start_idx": section.start_idx,
                    "end_idx": section.end_idx,
                })
        return results

    def _save_state(self) -> None:
        """
        Save the FAISS index and sections to local disk.
        """
        cache_path = os.path.join(self.cache_dir, "terms_search")
        faiss.write_index(self.index, f"{cache_path}.index")

        state = {
            "sections": self.sections,
            "original_text": self.original_text,
        }
        with open(f"{cache_path}.pkl", "wb") as f:
            pickle.dump(state, f)

    def _create_index(self, embeddings: np.ndarray) -> faiss.Index:
        """
        Create and return a FAISS index from the given embeddings.
        Normalizes the embeddings and uses a simple Inner Product index.
        """
        if embeddings.ndim == 1:
            embeddings = embeddings.reshape(1, -1)
        dim = embeddings.shape[1]

        index = faiss.IndexFlatIP(dim)
        faiss.normalize_L2(embeddings)
        index.add(embeddings)
        return index

    def _split_into_sections(self, content: str) -> List[TermSection]:
        """
        Naive splitting of content by lines. If a line starts with and ends with '**',
        we treat it as a new title, otherwise it's appended as content to a section.
        """
        sections: List[TermSection] = []
        current_title = "Introduction"
        section_id = 0
        current_position = 0

        lines = content.split("\n")
        for line in lines:
            clean_line = line.strip()
            if not clean_line:
                continue

            if clean_line.startswith("**") and clean_line.endswith("**"):
                current_title = clean_line.replace("**", "")
                current_position = content.find(line, current_position) + len(line)
            else:
                line_start = content.find(line, current_position)
                if line_start != -1:
                    line_end = line_start + len(line)
                    sections.append(
                        TermSection(
                            section_id=section_id,
                            content=clean_line,
                            title=current_title,
                            start_idx=line_start,
                            end_idx=line_end
                        )
                    )
                    section_id += 1
                    current_position = line_end

        return sections
