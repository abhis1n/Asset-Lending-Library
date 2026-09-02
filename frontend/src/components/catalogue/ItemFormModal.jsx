import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { ErrorBanner } from '../common/UIStates';

export function ItemFormModal({ isOpen, onClose, onSuccess, editItem = null }) {
  const isEditing = Boolean(editItem);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [identifyingCode, setIdentifyingCode] = useState('');
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editItem) {
      setTitle(editItem.title || '');
      setCategory(editItem.category || '');
      setIdentifyingCode(editItem.identifyingCode || '');
    } else {
      setTitle('');
      setCategory('');
      setIdentifyingCode('');
    }
    setErrors({});
    setApiError('');

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editItem, isOpen, submitting, onClose]);

  if (!isOpen) return null;

  const validate = () => {
    const nextErrors = {};
    if (!title.trim()) {
      nextErrors.title = 'Title is required.';
    }
    if (!category.trim()) {
      nextErrors.category = 'Category is required.';
    }
    if (!identifyingCode.trim()) {
      nextErrors.identifyingCode = 'Identifying code is required.';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');

    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        category: category.trim(),
        identifyingCode: identifyingCode.trim(),
      };

      let result;
      if (isEditing) {
        result = await api.patch(`/items/${editItem.id}`, payload);
      } else {
        result = await api.post('/items', payload);
      }

      onSuccess(result.item);
      onClose();
    } catch (err) {
      setApiError(err.message || 'Failed to save catalogue item.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={isEditing ? 'Edit Catalogue Item' : 'Add New Catalogue Item'}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{isEditing ? 'Edit Catalogue Item' : 'Add New Catalogue Item'}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            <ErrorBanner message={apiError} onDismiss={() => setApiError('')} />

            <div className="form-group">
              <label className="form-label" htmlFor="item-title">
                Item Title <span style={{ color: 'var(--danger-600)' }}>*</span>
              </label>
              <input
                id="item-title"
                type="text"
                className={`form-input ${errors.title ? 'is-invalid' : ''}`}
                placeholder="e.g. Sony Alpha A7 IV Camera"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={submitting}
                autoFocus
              />
              {errors.title && <div className="form-feedback-error">{errors.title}</div>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="item-category">
                Category <span style={{ color: 'var(--danger-600)' }}>*</span>
              </label>
              <input
                id="item-category"
                type="text"
                className={`form-input ${errors.category ? 'is-invalid' : ''}`}
                placeholder="e.g. Photography, Electronics, Tools"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={submitting}
              />
              {errors.category && <div className="form-feedback-error">{errors.category}</div>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="item-identifyingCode">
                Identifying Code <span style={{ color: 'var(--danger-600)' }}>*</span>
              </label>
              <input
                id="item-identifyingCode"
                type="text"
                className={`form-input ${errors.identifyingCode ? 'is-invalid' : ''}`}
                placeholder="e.g. CAM-SONY-001"
                value={identifyingCode}
                onChange={(e) => setIdentifyingCode(e.target.value)}
                disabled={submitting}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '0.25rem' }}>
                Must be unique across all catalogue items.
              </p>
              {errors.identifyingCode && (
                <div className="form-feedback-error">{errors.identifyingCode}</div>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : isEditing ? 'Update Item' : 'Create Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
