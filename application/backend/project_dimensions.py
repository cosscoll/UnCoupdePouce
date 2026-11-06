"""Optional, user-declared project measurements (F11).

Never calculate a quote, assert measurement accuracy, or infer dimensions.
Read/write after the regular project/draft authorization checks.
"""
from pydantic import BaseModel, ConfigDict, Field, field_validator
from project_budget import Budget

class Dimensions(BaseModel):
    model_config = ConfigDict(extra='forbid')
    surface_m2: float | None = Field(default=None, strict=True, gt=0, le=10000, allow_inf_nan=False)
    length_m: float | None = Field(default=None, strict=True, gt=0, le=10000, allow_inf_nan=False)
    width_m: float | None = Field(default=None, strict=True, gt=0, le=10000, allow_inf_nan=False)
    height_m: float | None = Field(default=None, strict=True, gt=0, le=10000, allow_inf_nan=False)

    @field_validator('surface_m2','length_m','width_m','height_m')
    @classmethod
    def precision(cls,v):
        if v is not None and abs(v * 100 - round(v * 100)) > 0.0000001:
            raise ValueError('Utilisez au maximum deux décimales pour les mesures.')
        return v

    def populated(self):
        return self.model_dump(exclude_none=True)

class MeasuredBudget(Budget):
    dimensions: Dimensions = Field(default_factory=Dimensions)
