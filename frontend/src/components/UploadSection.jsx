import { useState, useRef, useCallback } from 'react'

const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const ALLOWED_EXTS = ['pdf', 'doc', 'docx']
const MAX_SIZE = 16 * 1024 * 1024

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function UploadSection({ selectedFile, onFileSelect, onAnalyze, onToast }) {
  const [dragOver, setDragOver] = useState(false)
  const [jdOpen, setJdOpen] = useState(false)
  const [jobDescription, setJobDescription] = useState('')
  const fileInputRef = useRef(null)

  const handleFile = useCallback((file) => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTS.includes(ext)) {
      onToast('Please upload a PDF, DOC, or DOCX file.', 'error')
      return
    }
    if (file.size > MAX_SIZE) {
      onToast('File exceeds the 16 MB limit.', 'error')
      return
    }
    onFileSelect(file)
  }, [onFileSelect, onToast])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }, [handleFile])

  const onDragOver = (e) => { e.preventDefault(); setDragOver(true) }
  const onDragLeave = () => setDragOver(false)

  const handleDropZoneClick = (e) => {
    if (e.target.closest('.file-selected') || e.target.closest('.remove-file')) return
    fileInputRef.current?.click()
  }

  return (
    <section className="card upload-card" id="uploadSection">
      <div className="card-header">
        <i className="fa-solid fa-cloud-arrow-up card-header-icon"></i>
        <h2>Upload CV</h2>
      </div>

      {/* Drop Zone */}
      <div
        className={`drop-zone${dragOver ? ' drag-over' : ''}`}
        id="dropZone"
        onClick={handleDropZoneClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <input
          type="file"
          ref={fileInputRef}
          accept=".pdf,.doc,.docx"
          style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files[0])}
          id="fileInput"
        />

        {!selectedFile ? (
          <div className="drop-zone-inner" id="dropZoneInner">
            <div className="drop-icon-wrap">
              <i className="fa-regular fa-file-lines drop-icon"></i>
            </div>
            <p className="drop-primary">Drag &amp; drop your CV here</p>
            <p className="drop-secondary">
              or{' '}
              <button
                className="inline-btn"
                id="browseBtn"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
              >
                browse files
              </button>
            </p>
            <p className="drop-formats">PDF · DOC · DOCX &nbsp;·&nbsp; Max 16 MB</p>
          </div>
        ) : (
          <div className="file-selected" id="fileSelected">
            <i className="fa-regular fa-circle-check file-check-icon"></i>
            <div className="file-info">
              <span className="file-name">{selectedFile.name}</span>
              <span className="file-size">{formatBytes(selectedFile.size)}</span>
            </div>
            <button
              className="remove-file"
              id="removeFile"
              aria-label="Remove file"
              onClick={(e) => { e.stopPropagation(); onFileSelect(null) }}
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        )}
      </div>

      {/* Job Description */}
      <div className="jd-section">
        <button className="jd-toggle" id="jdToggle" onClick={() => setJdOpen(o => !o)}>
          <i className="fa-solid fa-briefcase"></i>
          Paste Job Description <span className="badge-optional">optional</span>
          <i className={`fa-solid fa-chevron-down jd-chevron${jdOpen ? ' open' : ''}`} id="jdChevron"></i>
        </button>
        {jdOpen && (
          <div className="jd-body" id="jdBody">
            <textarea
              id="jobDescription"
              placeholder="Paste the job description here to get a match score comparing the CV against the role requirements…"
              rows="6"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
            />
            <p className="jd-hint">
              <i className="fa-solid fa-circle-info"></i> The AI will calculate a compatibility score and highlight keyword gaps.
            </p>
          </div>
        )}
      </div>

      <button
        className="btn-analyze"
        id="analyzeBtn"
        disabled={!selectedFile}
        onClick={() => onAnalyze(selectedFile, jobDescription)}
      >
        <i className="fa-solid fa-magnifying-glass-chart"></i>
        Analyze CV
      </button>
    </section>
  )
}
