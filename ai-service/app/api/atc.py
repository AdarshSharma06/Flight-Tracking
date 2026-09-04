"""ATC explanation endpoint — AI-7 anomaly explanation API."""

import logging

from fastapi import APIRouter, Request

from app.api.atc_models import AtcExplanationRequest, AtcExplanationResponse
from app.api.atc_service import explain_anomaly
from app.llm import create_llm_client

logger = logging.getLogger(__name__)

router = APIRouter(tags=["atc"])

_llm_client = None


def _get_llm_client():
    global _llm_client
    if _llm_client is None:
        _llm_client = create_llm_client()
    return _llm_client


@router.post("/atc/explain", response_model=AtcExplanationResponse)
async def atc_explain(request: AtcExplanationRequest, http_request: Request):
    """Explain an existing ATC anomaly.

    The anomaly has already been detected by the application's anomaly detection system.
    This endpoint receives the anomaly context from Spring Boot and generates
    a grounded natural-language explanation via the LLM.

    The LLM does NOT detect anomalies. It explains them.
    """
    request_id = getattr(http_request.state, "request_id", "unknown")
    llm_client = _get_llm_client()

    response = await explain_anomaly(request, llm_client)
    return response
