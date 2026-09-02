import React, { useState, useRef } from 'react';
import { api } from '../../services/api';
import { ErrorBanner, LoadingSpinner } from '../common/UIStates';

export function CsvImportModal({ isOpen, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !uploading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, uploading, onClose]);

  if (!isOpen) return null;

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setApiError('Please select a valid CSV file (.csv extension).');
      return;
    }

    setFile(selectedFile);
    setApiError('');
    setResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      setFileContent(e.target.result);
    };
    reader.onerror = () => {
      setApiError('Failed to read the selected file.');
    };
    reader.readAsText(selectedFile);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!fileContent.trim()) {
      setApiError('CSV file is empty. Please select a valid CSV file with data rows.');
      return;
    }

    setUploading(true);
    setApiError('');
    try {
      const response = await api.post('/items/import', {
        csv: fileContent,
      });
      setResult(response);
      onSuccess();
    } catch (err) {
      setApiError(err.message || 'Failed to import catalogue CSV.');
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setFileContent('');
    setResult(null);
    setApiError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="csv-import-modal-title">
      <div className="modal-container" style={{ maxWidth: '620px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="csv-import-modal-title" className="modal-title">Bulk Import Catalogue Items (CSV)</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
            &times;
          </button>
        </div>

        <div className="modal-body">
          <ErrorBanner message={apiError} onDismiss={() => setApiError('')} />

          {/* Results View */}
          {result ? (
            <div>
              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-main)' }}>
                  Import Summary
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {result.message}
                </p>
              </div>

              {/* Summary Stats Grid */}
              <div className="results-summary-grid">
                <div className="results-stat-box neutral">
                  <div style={{ fontSize: '1.4rem', fontWeight: '700' }}>{result.totalRows || result.summary?.total || 0}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Rows</div>
                </div>
                <div className="results-stat-box success">
                  <div style={{ fontSize: '1.4rem', fontWeight: '700' }}>{result.successfulRows || result.summary?.successful || 0}</div>
                  <div style={{ fontSize: '0.75rem' }}>Imported</div>
                </div>
                <div className="results-stat-box error">
                  <div style={{ fontSize: '1.4rem', fontWeight: '700' }}>{result.failedRows || result.summary?.failed || 0}</div>
                  <div style={{ fontSize: '0.75rem' }}>Failed</div>
                </div>
              </div>

              {/* Error Details Table (if any row errors) */}
              {result.errors && result.errors.length > 0 && (
                <div style={{ marginTop: '1.25rem' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--danger-600)', marginBottom: '0.5rem' }}>
                    ⚠️ Failed Row Details ({result.errors.length})
                  </h4>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)' }}>
                    <table className="error-details-table">
                      <thead>
                        <tr>
                          <th style={{ width: '60px' }}>Row</th>
                          <th style={{ width: '120px' }}>Code</th>
                          <th>Error Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.errors.map((err, idx) => (
                          <tr key={idx}>
                            <td style={{ fontWeight: '700' }}>#{err.row}</td>
                            <td>{err.identifyingCode || '—'}</td>
                            <td>{err.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : uploading ? (
            <div style={{ padding: '3rem 0' }}>
              <LoadingSpinner message="Processing and validating CSV catalogue rows..." />
            </div>
          ) : (
            <div>
              {/* Guidance & Required Headers */}
              <div style={{ backgroundColor: 'var(--bg-app)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', fontSize: '0.825rem' }}>
                <div style={{ fontWeight: '700', marginBottom: '0.25rem', color: 'var(--text-main)' }}>
                  📋 Required CSV File Format
                </div>
                <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Your CSV must include the following column headers (supports up to 500 rows):
                </p>
                <div style={{ fontFamily: 'monospace', backgroundColor: '#ffffff', padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                  title,category,identifyingCode,archived
                </div>
              </div>

              {/* Drag and Drop Zone */}
              <div
                className={`file-dropzone ${dragOver ? 'dragover' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <span style={{ fontSize: '2.25rem' }} aria-hidden="true">📄</span>
                <div>
                  <div style={{ fontWeight: '600', color: 'var(--text-main)' }}>
                    Drag and drop your CSV file here, or click to browse
                  </div>
                  <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Accepts standard RFC 4180 CSV files (.csv)
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileSelect(e.target.files[0]);
                    }
                  }}
                />
              </div>

              {/* Selected File Preview Box */}
              {file && (
                <div className="file-info-box">
                  <div>
                    <span style={{ fontWeight: '600' }}>📎 {file.name}</span>{' '}
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      ({(file.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReset();
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {result ? (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleReset}>
                Import Another File
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
                Done & View Catalogue
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={uploading}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleUpload}
                disabled={uploading || !fileContent}
              >
                {uploading ? 'Importing...' : 'Upload & Import CSV'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
