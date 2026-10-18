"""add thread_messages (patient<->doctor messaging)

Revision ID: 071f7cc7d94b
Revises: 75c5cc149e47
Create Date: 2026-10-14 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '071f7cc7d94b'
down_revision: Union[str, Sequence[str], None] = '75c5cc149e47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'thread_messages',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('doctor_id', sa.Integer(), nullable=False),
        sa.Column('sender_role', sa.String(length=16), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['doctor_id'], ['doctors.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_thread_messages_patient_id'), 'thread_messages', ['patient_id'])
    op.create_index(op.f('ix_thread_messages_doctor_id'), 'thread_messages', ['doctor_id'])
    op.create_index(op.f('ix_thread_messages_created_at'), 'thread_messages', ['created_at'])


def downgrade() -> None:
    op.drop_table('thread_messages')
