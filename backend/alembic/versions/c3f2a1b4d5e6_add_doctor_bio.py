"""add bio + years_experience to doctors

Revision ID: c3f2a1b4d5e6
Revises: 071f7cc7d94b
Create Date: 2026-10-18 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c3f2a1b4d5e6'
down_revision: Union[str, Sequence[str], None] = '071f7cc7d94b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('doctors', sa.Column('bio', sa.Text(), nullable=True))
    op.add_column('doctors', sa.Column('years_experience', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('doctors', 'years_experience')
    op.drop_column('doctors', 'bio')
