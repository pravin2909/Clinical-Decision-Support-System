"""add prescriber_name to prescriptions

Revision ID: 75c5cc149e47
Revises: a1d8ddea1fb5
Create Date: 2026-10-13 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '75c5cc149e47'
down_revision: Union[str, Sequence[str], None] = 'a1d8ddea1fb5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('prescriptions', sa.Column('prescriber_name', sa.String(length=160), nullable=True))


def downgrade() -> None:
    op.drop_column('prescriptions', 'prescriber_name')
