"""add care_relationships and consents

Revision ID: aef704c47c73
Revises: dea9bc6f1465
Create Date: 2026-10-12 00:00:00.000000

Adds the access-control spine: a doctor↔patient ``care_relationships`` link with
a pending/active/revoked lifecycle, and per-scope ``consents`` grants (soft
revoke via ``revoked_at``). Enum types are created inline with the tables (as in
the baseline) and dropped explicitly on downgrade.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'aef704c47c73'
down_revision: Union[str, Sequence[str], None] = 'dea9bc6f1465'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'care_relationships',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('doctor_id', sa.Integer(), nullable=False),
        sa.Column(
            'status',
            sa.Enum('pending', 'active', 'revoked', name='care_status'),
            nullable=False,
        ),
        sa.Column(
            'initiated_by',
            # A dedicated type (NOT the shared user_role) so the ORM's cast
            # ``::care_initiator`` matches the column. Values mirror Role.
            sa.Enum('admin', 'doctor', 'patient', name='care_initiator'),
            nullable=False,
        ),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['doctor_id'], ['doctors.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('patient_id', 'doctor_id', name='uq_care_patient_doctor'),
    )
    op.create_index(
        op.f('ix_care_relationships_patient_id'), 'care_relationships', ['patient_id'], unique=False
    )
    op.create_index(
        op.f('ix_care_relationships_doctor_id'), 'care_relationships', ['doctor_id'], unique=False
    )
    op.create_index(
        op.f('ix_care_relationships_status'), 'care_relationships', ['status'], unique=False
    )

    op.create_table(
        'consents',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('doctor_id', sa.Integer(), nullable=False),
        sa.Column(
            'scope',
            sa.Enum('records', 'images', 'chat', name='consent_scope'),
            nullable=False,
        ),
        sa.Column('granted_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['doctor_id'], ['doctors.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('patient_id', 'doctor_id', 'scope', name='uq_consent_triple'),
    )
    op.create_index(op.f('ix_consents_patient_id'), 'consents', ['patient_id'], unique=False)
    op.create_index(op.f('ix_consents_doctor_id'), 'consents', ['doctor_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_consents_doctor_id'), table_name='consents')
    op.drop_index(op.f('ix_consents_patient_id'), table_name='consents')
    op.drop_table('consents')

    op.drop_index(op.f('ix_care_relationships_status'), table_name='care_relationships')
    op.drop_index(op.f('ix_care_relationships_doctor_id'), table_name='care_relationships')
    op.drop_index(op.f('ix_care_relationships_patient_id'), table_name='care_relationships')
    op.drop_table('care_relationships')

    # Drop the enum types we created (user_role is left intact — it predates us).
    bind = op.get_bind()
    sa.Enum(name='consent_scope').drop(bind, checkfirst=True)
    sa.Enum(name='care_initiator').drop(bind, checkfirst=True)
    sa.Enum(name='care_status').drop(bind, checkfirst=True)
