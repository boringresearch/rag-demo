import os
from fastapi import FastAPI, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from dotenv import load_dotenv
import assemblyai as aai

from search.terms_search_engine import TermsSearchEngine

# Load environment variables
load_dotenv()
aai.settings.api_key = os.getenv("ASSEMBLYAI_API_KEY", "")

# Embedding configuration
EMBEDDING_API_URL = os.getenv("EMBEDDING_API_URL", "http://localhost:8080")
EMBEDDING_PROVIDER = os.getenv("EMBEDDING_PROVIDER", "llama")
EMBEDDING_DIMENSION = int(os.getenv("EMBEDDING_DIMENSION", "384"))

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware to inject security-related headers into each response.
    """
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["Cross-Origin-Embedder-Policy"] = "require-corp"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
        return response

def create_app() -> FastAPI:
    """
    Creates and configures the FastAPI application.
    """
    app = FastAPI(title="My Open RAG Project", version="0.1.0")

    # Mount static files (CSS, JS, etc.)
    app.mount("/static", StaticFiles(directory="static"), name="static")
    templates = Jinja2Templates(directory="src/templates")

    # Initialize TermsSearchEngine with configuration from environment variables
    terms_engine = TermsSearchEngine(
        embedding_api_url=EMBEDDING_API_URL,
        embedding_provider=EMBEDDING_PROVIDER,
        embedding_dimension=EMBEDDING_DIMENSION
    )

    # Add middlewares
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"]
    )

    @app.on_event("startup")
    async def on_startup():
        """
        Attempt to load existing search index state on server startup.
        If not available, build a new index from a default file.
        """
        if not terms_engine.load_state():
            # If no cache, build index from a default file
            if os.path.exists("noterms.md"):
                terms_engine.build_index("noterms.md")
            else:
                print("No 'noterms.md' file found, skipping index build.")

    @app.get("/", response_class=HTMLResponse)
    async def read_root(request: Request):
        """
        Main page serving index.html
        """
        return templates.TemplateResponse("index.html", {"request": request})

    @app.get("/examples")
    async def list_examples():
        """
        Load examples from output.json and randomly select 3 to show.
        """
        import json, random
        try:
            with open("examples/output.json", "r", encoding="utf-8") as f:
                all_examples = json.load(f)

            selected_examples = random.sample(all_examples, min(3, len(all_examples)))
            examples = [
                {
                    "id": str(example["example_id"]),
                    "name": f"{example['product_info']['name']} - {example['product_info']['policy_number']}"
                }
                for example in selected_examples
            ]
            return JSONResponse({"success": True, "examples": examples})
        except Exception as e:
            return JSONResponse({"success": False, "error": str(e)})

    @app.get("/convert-example/{example_id}")
    async def convert_example(example_id: str):
        """
        Convert a selected example from output.json into transcript format,
        including an example SRT and VTT output.
        """
        import json
        try:
            with open("examples/output.json", "r", encoding="utf-8") as f:
                all_examples = json.load(f)

            example = next((e for e in all_examples if str(e["example_id"]) == example_id), None)
            if not example:
                raise ValueError("Example not found")

            transcript_data = []
            dialog = example["dialog"]
            for i, entry in enumerate(dialog):
                minutes, seconds = map(int, entry["time"].split(":"))
                start_ms = (minutes * 60 + seconds) * 1000

                # get end time from next entry or default +5s
                if i < len(dialog) - 1:
                    next_minutes, next_seconds = map(int, dialog[i+1]["time"].split(":"))
                    end_ms = (next_minutes * 60 + next_seconds) * 1000
                else:
                    end_ms = start_ms + 5000

                # speaker label: 1 for Agent, 2 for Customer
                speaker = 1 if entry["text"].startswith("Agent:") else 2

                transcript_data.append({
                    "text": entry["text"],
                    "start": start_ms,
                    "end": end_ms,
                    "speaker": speaker
                })

            # Simple SRT/VTT (just an example for the first line)
            if len(dialog) > 1:
                _, next_seconds = map(int, dialog[1]["time"].split(":"))
            else:
                next_seconds = 5
            srt_content = (
                f"1\n00:00:00,000 --> 00:00:{next_seconds:02d},000\n{dialog[0]['text']}"
            )
            vtt_content = (
                f"WEBVTT\n\n00:00:00.000 --> 00:00:{next_seconds:02d}.000\n{dialog[0]['text']}"
            )

            return JSONResponse({
                "success": True,
                "transcript": transcript_data,
                "srt": srt_content,
                "vtt": vtt_content
            })
        except Exception as e:
            return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

    @app.post("/upload")
    async def upload_video(file: UploadFile = File(...),
                           speakers_expected: int = Form(0)):
        """
        Upload an audio/video file and send it to AssemblyAI for transcription,
        returning transcripts and SRT/VTT subtitles.
        """
        import shutil
        try:
            os.makedirs("uploads", exist_ok=True)
            file_path = f"uploads/{file.filename}"

            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            # assemblyai config
            config = aai.TranscriptionConfig(speaker_labels=True)
            if speakers_expected and speakers_expected > 0:
                config.speakers_expected = speakers_expected

            # transcribe using AssemblyAI
            transcript_obj = aai.Transcriber().transcribe(file_path, config)
            if not transcript_obj or not transcript_obj.utterances:
                raise ValueError("未检测到语音或文件音频不清晰")

            formatted_utterances = [
                {
                    "text": u.text,
                    "start": u.start,
                    "end": u.end,
                    "speaker": u.speaker
                }
                for u in transcript_obj.utterances
            ]

            srt_content = transcript_obj.export_subtitles_srt() or ""
            vtt_content = transcript_obj.export_subtitles_vtt() or ""

            # clean up
            os.remove(file_path)

            return JSONResponse({
                "success": True,
                "transcript": formatted_utterances,
                "srt": srt_content,
                "vtt": vtt_content
            })
        except ValueError as ve:
            return JSONResponse(status_code=400, content={"success": False, "error": str(ve)})
        except Exception as e:
            error_msg = "处理文件失败，请确认文件包含可识别的语音。"
            if "Unable to create captions" in str(e):
                error_msg = "未检测到语音，请确认音频内容清晰。"
            return JSONResponse(status_code=500, content={"success": False, "error": error_msg})

    @app.post("/search")
    async def search(request: Request):
        """
        Perform semantic search on a user-provided text, returning the top matches.
        """
        data = await request.json()
        query = data.get("query", "")
        text = data.get("text", "")

        try:
            if not terms_engine.index:
                # Build or process new text on-the-fly
                terms_engine.process_text(text)

            matches = terms_engine.search(query, k=5)
            return {
                "success": True,
                "matches": [
                    {
                        "text": m["content"],
                        "score": m["similarity"],
                        "start_idx": m["start_idx"],
                        "end_idx": m["end_idx"]
                    }
                    for m in matches
                ]
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    return app
