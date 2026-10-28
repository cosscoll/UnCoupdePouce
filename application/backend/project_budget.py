"""User-declared indicative work budgets, never UCP prices or quotations."""
from pydantic import BaseModel,Field,model_validator

# Technical storage bound: nullable PostgreSQL INTEGER, whole euros only.
MAX_BUDGET=2_147_483_647
class Budget(BaseModel):
    budget_min:int|None=Field(default=None,ge=0,le=MAX_BUDGET,strict=True)
    budget_max:int|None=Field(default=None,ge=0,le=MAX_BUDGET,strict=True)
    @model_validator(mode='after')
    def coherent(self):
        if self.budget_min is not None and self.budget_max is not None and self.budget_min>self.budget_max:
            raise ValueError('Le budget minimum ne peut pas dépasser le maximum')
        return self


def overlaps(item,lower=None,upper=None):
    if lower is None and upper is None:return True
    minimum,maximum=item.get('budget_min'),item.get('budget_max')
    if minimum is None and maximum is None:return False
    if lower is not None and maximum is not None and maximum<lower:return False
    if upper is not None and minimum is not None and minimum>upper:return False
    return True
