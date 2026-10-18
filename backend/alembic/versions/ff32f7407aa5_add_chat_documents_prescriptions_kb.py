"""add chat, documents, prescriptions, and KB tables

Revision ID: ff32f7407aa5
Revises: aef704c47c73
Create Date: 2026-10-12 00:00:00.000000

Adds the Phase-3 agentic tables: conversations + messages (server-side chat
memory), documents + prescriptions, and the pgvector-backed knowledge base
(kb_documents + kb_chunks). Enables the ``vector`` extension.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from pgvector.sqlalchemy import Vector

# revision identifiers, used by Alembic.
revision: str = 'ff32f7407aa5'
down_revision: Union[str, Sequence[str], None] = 'aef704c47c73'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMBED_DIM = 768


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        'conversations',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('role_context', sa.String(length=16), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=True),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_conversations_user_id'), 'conversations', ['user_id'])
    op.create_index(op.f('ix_conversations_created_at'), 'conversations', ['created_at'])

    op.create_table(
        'messages',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('conversation_id', sa.Integer(), nullable=False),
        sa.Column('role', sa.String(length=16), nullable=False),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('tool_calls', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('citations', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['conversation_id'], ['conversations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_messages_conversation_id'), 'messages', ['conversation_id'])

    op.create_table(
        'documents',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('type', sa.String(length=24), nullable=False),
        sa.Column('file_uri', sa.String(length=512), nullable=True),
        sa.Column('extracted_text', sa.Text(), nullable=True),
        sa.Column('parsed', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_documents_patient_id'), 'documents', ['patient_id'])
    op.create_index(op.f('ix_documents_status'), 'documents', ['status'])

    op.create_table(
        'prescriptions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('doctor_id', sa.Integer(), nullable=True),
        sa.Column('items', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('issued_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['doctor_id'], ['doctors.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_prescriptions_patient_id'), 'prescriptions', ['patient_id'])
    op.create_index(op.f('ix_prescriptions_doctor_id'), 'prescriptions', ['doctor_id'])

    op.create_table(
        'kb_documents',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('audience', sa.String(length=16), nullable=False),
        sa.Column('title', sa.String(length=300), nullable=False),
        sa.Column('source_url', sa.String(length=512), nullable=True),
        sa.Column('license', sa.String(length=120), nullable=True),
        sa.Column('ingested_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_kb_documents_audience'), 'kb_documents', ['audience'])

    op.create_table(
        'kb_chunks',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('document_id', sa.Integer(), nullable=False),
        sa.Column('audience', sa.String(length=16), nullable=False),
        sa.Column('chunk_text', sa.Text(), nullable=False),
        sa.Column('embedding', Vector(EMBED_DIM), nullable=True),
        sa.Column('doc_metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(['document_id'], ['kb_documents.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_kb_chunks_document_id'), 'kb_chunks', ['document_id'])
    op.create_index(op.f('ix_kb_chunks_audience'), 'kb_chunks', ['audience'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('kb_chunks')
    op.drop_table('kb_documents')
    op.drop_table('prescriptions')
    op.drop_table('documents')
    op.drop_table('messages')
    op.drop_table('conversations')
