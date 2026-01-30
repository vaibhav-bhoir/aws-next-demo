"use client";

import { useEffect, useRef, useState } from "react";

interface Note {
  noteId: string;
  title: string;
  content: string;
  fileUrl?: string;
  fileName?: string;
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Edit modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [removeExistingFile, setRemoveExistingFile] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const loadNotes = async () => {
    try {
      const res = await fetch("/api/notes");
      const data = await res.json();
      
      // Handle different response formats
      if (Array.isArray(data)) {
        setNotes(data);
      } else if (data.items && Array.isArray(data.items)) {
        setNotes(data.items);
      } else {
        console.error("Unexpected response format:", data);
        setNotes([]);
      }
    } catch (error) {
      console.error("Failed to load notes:", error);
      setNotes([]);
    }
  };

  const addNote = async () => {
    if (!title.trim() || !content.trim()) {
      setError("Title and content are required");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const formData = new FormData();
      formData.append("title", title);
      formData.append("content", content);
      if (file) {
        formData.append("file", file);
      }

      const res = await fetch("/api/notes", {
        method: "POST",
        body: formData, // FormData automatically sets correct headers
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to add note");
      }

      setTitle("");
      setContent("");
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotes();
  }, []);

  const deleteNote = async (noteId: string) => {
    if (!confirm("Are you sure you want to delete this note?")) return;
    
    await fetch(`/api/notes?noteId=${noteId}`, { method: "DELETE" });
    loadNotes();
  };

  const openEditModal = (note: Note) => {
    setEditingNote(note);
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditFile(null);
    setRemoveExistingFile(false);
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setEditingNote(null);
    setEditTitle("");
    setEditContent("");
    setEditFile(null);
    setRemoveExistingFile(false);
    if (editFileInputRef.current) {
      editFileInputRef.current.value = "";
    }
  };

  const saveEdit = async () => {
    if (!editingNote) return;
    
    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("noteId", editingNote.noteId);
      formData.append("title", editTitle);
      formData.append("content", editContent);
      
      if (editFile) {
        formData.append("file", editFile);
      }

      const res = await fetch("/api/notes", {
        method: "PUT",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Failed to update note");
      }

      closeEditModal();
      loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update note");
    } finally {
      setLoading(false);
    }
  };


  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8 text-center">📝 Notes App</h1>

        {/* Add Note Form */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-700 mb-4">Add New Note</h2>
          
          {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">{error}</div>}
          
          <div className="space-y-4">
            <input
              placeholder="Note Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-3 border text-black border-gray-300 placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />

            <textarea
              placeholder="Note Content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 border text-black border-gray-300 placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">📎 Attach File (Optional)</label>
              <input
                ref={fileInputRef}
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2 border text-gray-400 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 file:cursor-pointer"
              />
              {file && <p className="text-sm text-gray-600 mt-2">Selected: {file.name}</p>}
            </div>

            <button 
              onClick={addNote}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 cursor-pointer text-white font-medium rounded-lg transition duration-200 shadow-md hover:shadow-lg"
            >
              {loading ? "Adding..." : "+ Add Note"}
            </button>
          </div>
        </div>

        {/* Notes List */}
        <div className="space-y-4">
          {notes.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">No notes yet. Create your first note above! 📝</p>
            </div>
          ) : (
            notes?.map((note) => (
              <div key={note.noteId} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition duration-200">
                <div className="mb-4">
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">{note.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{note.content}</p>
                  
                  {note.fileUrl && (
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                      <a 
                        href={note.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-2"
                      >
                        📎 {note.fileName || "Download File"}
                      </a>
                    </div>
                  )}
                </div>
                
                <div className="flex gap-3">
                  <button 
                    onClick={() => openEditModal(note)}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 cursor-pointer text-white font-medium rounded-lg transition duration-200 shadow-sm hover:shadow-md"
                  >
                    ✏️ Edit
                  </button>
                  
                  <button 
                    onClick={() => deleteNote(note.noteId)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 cursor-pointer text-white font-medium rounded-lg transition duration-200 shadow-sm hover:shadow-md"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Edit Modal */}
        {isEditModalOpen && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fadeIn"
            onClick={closeEditModal}
          >
            <div 
              className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-slideUp"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-2xl font-bold text-gray-800">✏️ Edit Note</h2>
                <button
                  onClick={closeEditModal}
                  className="text-gray-400 cursor-pointer hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition"
                >
                  ×
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4">
                {error && <div className="p-3 bg-red-100 text-red-700 rounded-lg">{error}</div>}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-4 py-3 border text-black border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Content</label>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={6}
                    className="w-full px-4 py-3 border text-black border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">📎 Update File (Optional)</label>
                  
                  {editingNote?.fileName && !editFile && (
                    <div className="mb-3 p-3 bg-blue-50 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-blue-600 font-medium">Current: {editingNote.fileName}</span>
                      </div>
                      <button
                        onClick={() => {
                          if (editFileInputRef.current) {
                            editFileInputRef.current.click();
                          }
                        }}
                        className="text-sm cursor-pointer text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Replace
                      </button>
                    </div>
                  )}
                  
                  <input
                    ref={editFileInputRef}
                    type="file"
                    onChange={(e) => setEditFile(e.target.files?.[0] || null)}
                    className="w-full px-4 py-2 border text-gray-400 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100 file:cursor-pointer"
                  />
                  {editFile && (
                    <p className="text-sm text-green-600 mt-2">New file selected: {editFile.name}</p>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex gap-3 p-6 border-t border-gray-200">
                <button
                  onClick={saveEdit}
                  disabled={loading}
                  className="flex-1 px-6 cursor-pointer py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition duration-200 shadow-md hover:shadow-lg"
                >
                  {loading ? "Saving..." : "💾 Save Changes"}
                </button>
                <button
                  onClick={closeEditModal}
                  disabled={loading}
                  className="px-6 py-3 cursor-pointer bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 text-gray-700 font-medium rounded-lg transition duration-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add animations to global styles */}
      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }

        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
    </main>
  );
}
