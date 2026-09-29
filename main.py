# Root-level entry point for Render deployment
# This avoids import issues with hyphens in directory names
import sys
import os

# Add the WattWise-AI directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'WattWise-AI'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'WattWise-AI', 'src'))

# Import and expose the FastAPI app
from src.api import app

# This is what gunicorn will load: main:app