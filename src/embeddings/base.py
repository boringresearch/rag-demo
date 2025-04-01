from abc import ABC, abstractmethod
from typing import List
import numpy as np

class EmbeddingsBase(ABC):
    """
    Abstract base class for embedding providers.
    """
    @abstractmethod
    def encode(self, texts: List[str]) -> np.ndarray:
        """
        Converts a list of strings to a 2D numpy array of shape (len(texts), embedding_dimension).
        """
        pass
