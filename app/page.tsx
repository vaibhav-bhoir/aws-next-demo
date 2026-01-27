"use client";

import { useEffect, useState } from "react";

interface Note {
  noteId: string;
  title: string;
  content: string;
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

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
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    });

    setTitle("");
    setContent("");
    loadNotes();
  };

  useEffect(() => {
    loadNotes();
  }, []);

  const deleteNote = async (noteId: string) => {
  await fetch(`/api/notes?noteId=${noteId}`, { method: "DELETE" });
  loadNotes();
};

const editNote = async (note: Note) => {
  const title = prompt("New title", note.title);
  const content = prompt("New content", note.content);

  if (!title || !content) return;

  await fetch("/api/notes", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      noteId: note.noteId,
      title,
      content,
    }),
  });

  loadNotes();
};


  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8 text-center">📝 Notes App</h1>

        {/* Add Note Form */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-700 mb-4">Add New Note</h2>
          
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

            <button 
              onClick={addNote}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 cursor-pointer text-white font-medium rounded-lg transition duration-200 shadow-md hover:shadow-lg"
            >
              Add Note
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
                </div>
                
                <div className="flex gap-3">
                  <button 
                    onClick={() => editNote(note)}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 cursor-pointer text-white font-medium rounded-lg transition duration-200 shadow-sm hover:shadow-md"
                  >
                    Edit
                  </button>
                  
                  <button 
                    onClick={() => deleteNote(note.noteId)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 cursor-pointer text-white font-medium rounded-lg transition duration-200 shadow-sm hover:shadow-md"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
