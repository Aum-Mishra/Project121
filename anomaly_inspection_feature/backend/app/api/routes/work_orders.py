from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Union, Any
from datetime import datetime
from app.db.database import get_db
from app.db.models import WorkOrder, WorkOrderStatus
from app.core.config import settings

router = APIRouter(prefix="/work-orders", tags=["work-orders"])


class WorkOrderResponse(BaseModel):
    id: int
    wo_id: str
    asset_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    status: Any = "OPEN"
    priority: int = 3
    assigned_to: Optional[int] = None
    created_at: Union[datetime, str]
    updated_at: Union[datetime, str]
    closed_at: Optional[Union[datetime, str]] = None

    class Config:
        from_attributes = True


class WorkOrderListResponse(BaseModel):
    work_orders: List[WorkOrderResponse]
    total: int


@router.get("", response_model=WorkOrderListResponse)
async def list_work_orders(
    asset_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(WorkOrder).filter(WorkOrder.company_id == settings.company_id)
    if asset_id:
        query = query.filter(WorkOrder.asset_id == asset_id)
    if status:
        query = query.filter(WorkOrder.status == status)
    total = query.count()
    work_orders = query.order_by(WorkOrder.created_at.desc()).offset(offset).limit(limit).all()
    return WorkOrderListResponse(
        work_orders=[WorkOrderResponse.model_validate(wo) for wo in work_orders],
        total=total,
    )


@router.get("/{wo_id}", response_model=WorkOrderResponse)
async def get_work_order(wo_id: str, db: Session = Depends(get_db)):
    work_order = db.query(WorkOrder).filter(WorkOrder.wo_id == wo_id).first()
    if not work_order:
        raise HTTPException(status_code=404, detail="Work order not found")
    return WorkOrderResponse.model_validate(work_order)