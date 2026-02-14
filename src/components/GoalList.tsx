'use client';

import { useState, useEffect, useRef, useCallback, DragEvent } from 'react';
import type { Goal, Subtask } from '@/types/index';

function CheckIcon({ checked, size = 'sm' }: { checked: boolean; size?: 'sm' | 'lg' }) {
  const dim = size === 'lg' ? 'w-6 h-6' : 'w-5 h-5';
  const svg = size === 'lg' ? 'w-4 h-4' : 'w-3 h-3';
  return (
    <div
      className={`
        ${dim} rounded-md border-2 flex items-center justify-center cursor-pointer
        transition-all duration-300 ease-out
        ${checked
          ? 'bg-emerald-500 border-emerald-500'
          : 'border-gray-600 hover:border-gray-400'
        }
      `}
      style={{
        transform: checked ? 'scale(1.1)' : 'scale(1)',
        transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
    >
      {checked && (
        <svg className={`${svg} text-white`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </div>
  );
}

// Fireworks celebration component
function Fireworks({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2500);
    return () => clearTimeout(timer);
  }, [onDone]);

  // Generate random particles
  const particles = Array.from({ length: 40 }, (_, i) => {
    const angle = (i / 40) * 360 + (Math.random() * 20 - 10);
    const distance = 60 + Math.random() * 100;
    const size = 4 + Math.random() * 6;
    const delay = Math.random() * 0.3;
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const dx = Math.cos((angle * Math.PI) / 180) * distance;
    const dy = Math.sin((angle * Math.PI) / 180) * distance;
    return { dx, dy, size, delay, color, id: i };
  });

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
      {/* Center burst */}
      <div className="relative">
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full"
            style={{
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              left: '50%',
              top: '50%',
              marginLeft: -p.size / 2,
              marginTop: -p.size / 2,
              animation: `firework-particle 1.2s ${p.delay}s ease-out forwards`,
              ['--dx' as string]: `${p.dx}px`,
              ['--dy' as string]: `${p.dy}px`,
              opacity: 0,
            }}
          />
        ))}
        {/* Center flash */}
        <div
          className="absolute w-16 h-16 rounded-full bg-emerald-400/30 -translate-x-1/2 -translate-y-1/2"
          style={{
            animation: 'firework-flash 0.6s ease-out forwards',
          }}
        />
      </div>
      {/* Big congrats text */}
      <div
        className="absolute text-3xl font-bold text-emerald-400"
        style={{
          animation: 'firework-text 2s ease-out forwards',
          textShadow: '0 0 20px rgba(16, 185, 129, 0.5)',
        }}
      >
        Goal Complete!
      </div>
    </div>
  );
}

function InlineEdit({
  value,
  onSave,
  className = '',
  placeholder = 'Untitled',
  autoEdit = false,
  onEditDone,
}: {
  value: string;
  onSave: (val: string) => void;
  className?: string;
  placeholder?: string;
  autoEdit?: boolean;
  onEditDone?: () => void;
}) {
  const [editing, setEditing] = useState(autoEdit);
  const [draft, setDraft] = useState(autoEdit ? '' : value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (autoEdit && !editing) {
      setEditing(true);
      setDraft('');
    }
  }, [autoEdit]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    onEditDone?.();
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      setDraft(value);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
            onEditDone?.();
          }
        }}
        className={`bg-gray-800 border border-gray-600 rounded px-2 py-0.5 outline-none focus:border-blue-500 transition-colors ${className}`}
        placeholder={placeholder}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={`cursor-pointer hover:text-blue-300 transition-colors ${className}`}
      title="Click to edit"
    >
      {value || placeholder}
    </span>
  );
}

export default function GoalList() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [showFireworks, setShowFireworks] = useState(false);

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const fetchGoals = useCallback(async () => {
    try {
      const res = await fetch('/api/goals');
      if (res.ok) {
        const data = await res.json();
        const goalList = data.goals || [];
        setGoals(goalList);
        if (!activeTab && goalList.length > 0) {
          setActiveTab(goalList[0].id);
        }
      }
    } catch {
      // Network error
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  // Helper: is a goal "complete" (has subtasks and all are done)
  const isGoalComplete = (goal: Goal) => {
    const subs = goal.subtasks || [];
    return subs.length > 0 && subs.every((s) => s.is_completed);
  };

  const addGoal = async () => {
    if (goals.length >= 3) return;
    const tempId = `temp-${Date.now()}`;
    const newGoal: Goal = {
      id: tempId,
      user_id: '',
      title: '',
      position: goals.length + 1,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      subtasks: [],
    };
    setGoals((prev) => [...prev, newGoal]);
    setActiveTab(tempId);
    setEditingGoalId(tempId);

    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled' }),
      });
      if (res.ok) {
        const data = await res.json();
        const created = data.goal;
        setGoals((prev) =>
          prev.map((g) => (g.id === tempId ? { ...created, subtasks: created.subtasks || [] } : g))
        );
        setActiveTab(created.id);
        setEditingGoalId(created.id);
      }
    } catch {
      setGoals((prev) => prev.filter((g) => g.id !== tempId));
    }
  };

  const updateGoalTitle = async (goalId: string, title: string) => {
    setGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, title } : g)));
    try {
      await fetch('/api/goals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: goalId, title }),
      });
    } catch {
      fetchGoals();
    }
  };

  const deleteGoal = async (goalId: string) => {
    const prev = goals;
    setGoals((g) => g.filter((goal) => goal.id !== goalId));
    // Keep activeTab as null-ish so the empty slot + Add Goal shows
    setActiveTab(null);
    try {
      await fetch('/api/goals', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: goalId }),
      });
    } catch {
      setGoals(prev);
    }
  };

  const toggleGoalComplete = (goalId: string) => {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) return;
    const subs = goal.subtasks || [];
    if (subs.length === 0) return;

    const allComplete = subs.every((s) => s.is_completed);
    const newState = !allComplete;

    // If marking all complete, fire celebration
    if (newState) {
      setShowFireworks(true);
    }

    // Toggle all subtasks
    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId
          ? {
              ...g,
              subtasks: (g.subtasks || []).map((s) => ({
                ...s,
                is_completed: newState,
                completed_at: newState ? new Date().toISOString() : null,
              })),
            }
          : g
      )
    );

    // Persist each subtask toggle
    subs.forEach((s) => {
      fetch(`/api/goals/${goalId}/subtasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtaskId: s.id, is_completed: newState }),
      }).catch(() => {});
    });
  };

  const reorderGoals = async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const reordered = [...goals];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    const updated = reordered.map((g, i) => ({ ...g, position: i + 1 }));
    setGoals(updated);

    try {
      await Promise.all(
        updated.map((g) =>
          fetch('/api/goals', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: g.id, position: g.position }),
          })
        )
      );
    } catch {
      fetchGoals();
    }
  };

  const addSubtask = async (goalId: string) => {
    const tempId = `temp-sub-${Date.now()}`;
    const newSubtask: Subtask = {
      id: tempId,
      goal_id: goalId,
      title: '',
      is_completed: false,
      completed_at: null,
      position: (goals.find((g) => g.id === goalId)?.subtasks?.length || 0) + 1,
      created_at: new Date().toISOString(),
    };

    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId ? { ...g, subtasks: [...(g.subtasks || []), newSubtask] } : g
      )
    );
    setEditingSubtaskId(tempId);

    try {
      const res = await fetch(`/api/goals/${goalId}/subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled' }),
      });
      if (res.ok) {
        const data = await res.json();
        const created = data.subtask;
        setEditingSubtaskId(created.id);
        setGoals((prev) =>
          prev.map((g) =>
            g.id === goalId
              ? { ...g, subtasks: (g.subtasks || []).map((s) => (s.id === tempId ? created : s)) }
              : g
          )
        );
      }
    } catch {
      setGoals((prev) =>
        prev.map((g) =>
          g.id === goalId
            ? { ...g, subtasks: (g.subtasks || []).filter((s) => s.id !== tempId) }
            : g
        )
      );
    }
  };

  const toggleSubtask = async (goalId: string, subtaskId: string, completed: boolean) => {
    // Check if this completion would complete the whole goal
    const goal = goals.find((g) => g.id === goalId);
    if (goal && completed) {
      const subs = goal.subtasks || [];
      const othersComplete = subs.filter((s) => s.id !== subtaskId).every((s) => s.is_completed);
      if (othersComplete && subs.length > 0) {
        setShowFireworks(true);
      }
    }

    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId
          ? {
              ...g,
              subtasks: (g.subtasks || []).map((s) =>
                s.id === subtaskId
                  ? { ...s, is_completed: completed, completed_at: completed ? new Date().toISOString() : null }
                  : s
              ),
            }
          : g
      )
    );

    try {
      await fetch(`/api/goals/${goalId}/subtasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtaskId, is_completed: completed }),
      });
    } catch {
      setGoals((prev) =>
        prev.map((g) =>
          g.id === goalId
            ? {
                ...g,
                subtasks: (g.subtasks || []).map((s) =>
                  s.id === subtaskId
                    ? { ...s, is_completed: !completed, completed_at: !completed ? new Date().toISOString() : null }
                    : s
                ),
              }
            : g
        )
      );
    }
  };

  const updateSubtaskTitle = async (goalId: string, subtaskId: string, title: string) => {
    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId
          ? { ...g, subtasks: (g.subtasks || []).map((s) => (s.id === subtaskId ? { ...s, title } : s)) }
          : g
      )
    );

    try {
      await fetch(`/api/goals/${goalId}/subtasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtaskId, title }),
      });
    } catch {
      fetchGoals();
    }
  };

  const deleteSubtask = async (goalId: string, subtaskId: string) => {
    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId
          ? { ...g, subtasks: (g.subtasks || []).filter((s) => s.id !== subtaskId) }
          : g
      )
    );

    try {
      await fetch(`/api/goals/${goalId}/subtasks`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtaskId }),
      });
    } catch {
      fetchGoals();
    }
  };

  // Drag handlers
  const handleDragStart = (e: DragEvent<HTMLDivElement>, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    if (e.currentTarget) {
      e.dataTransfer.setDragImage(e.currentTarget, e.currentTarget.offsetWidth / 2, e.currentTarget.offsetHeight / 2);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      reorderGoals(dragIndex, dragOverIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl">
      {showFireworks && <Fireworks onDone={() => setShowFireworks(false)} />}

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-4">
        {goals.map((goal, idx) => {
          const subtasks = goal.subtasks || [];
          const completed = subtasks.filter((s) => s.is_completed).length;
          const isActive = activeTab === goal.id;
          const isDragging = dragIndex === idx;
          const isDragOver = dragOverIndex === idx && dragIndex !== idx;
          const goalDone = isGoalComplete(goal);

          return (
            <div
              key={goal.id}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              onDragLeave={handleDragLeave}
              className={`
                relative cursor-grab active:cursor-grabbing
                ${isDragging ? 'opacity-40' : 'opacity-100'}
                ${isDragOver ? 'scale-105' : 'scale-100'}
                transition-all duration-150
              `}
            >
              {isDragOver && (
                <div className="absolute -left-1.5 top-1 bottom-1 w-0.5 bg-blue-400 rounded-full" />
              )}
              <button
                onClick={() => setActiveTab(isActive ? null : goal.id)}
                className={`
                  flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                  transition-all duration-200 select-none
                  ${goalDone
                    ? 'bg-emerald-900/30 text-emerald-300 border border-emerald-700/50 shadow-lg shadow-emerald-900/20'
                    : isActive
                      ? 'bg-gray-800 text-white border border-gray-600 shadow-lg'
                      : 'bg-gray-900 text-gray-400 border border-gray-800 hover:border-gray-700 hover:text-gray-300'
                  }
                `}
              >
                {/* Tab checkbox indicator */}
                <div className={`
                  w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0
                  transition-all duration-300
                  ${goalDone
                    ? 'bg-emerald-500 border-emerald-500'
                    : 'border-gray-600'
                  }
                `}>
                  {goalDone && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className={`truncate max-w-[120px] ${goalDone ? 'line-through opacity-70' : ''}`}>
                  {goal.title || 'Untitled'}
                </span>
                {subtasks.length > 0 && (
                  <span className={`text-xs ${goalDone ? 'text-emerald-400' : 'text-gray-500'}`}>
                    {completed}/{subtasks.length}
                  </span>
                )}
              </button>
            </div>
          );
        })}

        {goals.length < 3 && (
          <button
            onClick={addGoal}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm text-gray-500 border border-dashed border-gray-700 hover:border-gray-500 hover:text-gray-300 transition-all duration-200"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Goal
          </button>
        )}
      </div>

      {/* Expanded Goal */}
      {goals.map((goal) => {
        if (activeTab !== goal.id) return null;
        const subtasks = goal.subtasks || [];
        const goalDone = isGoalComplete(goal);

        return (
          <div
            key={goal.id}
            className={`
              border rounded-2xl p-5 animate-slide-down transition-colors duration-300
              ${goalDone
                ? 'bg-emerald-950/20 border-emerald-800/40'
                : 'bg-gray-900 border-gray-800'
              }
            `}
          >
            {/* Goal header with main checkbox */}
            <div className="flex items-center gap-3 mb-4">
              <div
                onClick={() => toggleGoalComplete(goal.id)}
                title={goalDone ? 'Uncheck all subtasks' : 'Complete all subtasks'}
              >
                <CheckIcon checked={goalDone} size="lg" />
              </div>
              <div className="flex-1 min-w-0">
                <InlineEdit
                  value={goal.title}
                  onSave={(title) => updateGoalTitle(goal.id, title)}
                  className={`text-lg font-semibold ${goalDone ? 'text-emerald-300 line-through' : 'text-white'}`}
                  autoEdit={editingGoalId === goal.id}
                  onEditDone={() => setEditingGoalId(null)}
                />
              </div>
              <button
                onClick={() => deleteGoal(goal.id)}
                className="text-gray-600 hover:text-red-400 transition-colors p-1 flex-shrink-0"
                title="Delete goal"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>

            {/* Subtasks */}
            <div className="space-y-1 ml-9">
              {subtasks.map((subtask) => (
                <div
                  key={subtask.id}
                  className={`
                    group flex items-center gap-3 px-3 py-2.5 rounded-lg
                    hover:bg-gray-800/50 transition-all duration-150
                    ${subtask.is_completed ? 'opacity-60' : ''}
                  `}
                >
                  <div onClick={() => toggleSubtask(goal.id, subtask.id, !subtask.is_completed)}>
                    <CheckIcon checked={subtask.is_completed} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <InlineEdit
                      value={subtask.title}
                      onSave={(title) => updateSubtaskTitle(goal.id, subtask.id, title)}
                      className={`text-sm ${subtask.is_completed ? 'line-through text-gray-500' : 'text-gray-200'}`}
                      autoEdit={editingSubtaskId === subtask.id}
                      onEditDone={() => setEditingSubtaskId(null)}
                      placeholder="What's the next step?"
                    />
                  </div>
                  <button
                    onClick={() => deleteSubtask(goal.id, subtask.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all p-1"
                    title="Delete subtask"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => addSubtask(goal.id)}
              className="mt-3 flex items-center gap-2 text-sm text-gray-500 hover:text-blue-400 transition-colors px-3 py-2 ml-9"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add subtask
            </button>
          </div>
        );
      })}

      {/* Empty state - no goals OR no active tab (after delete) */}
      {activeTab === null && goals.length < 3 && (
        <div className="text-center py-16 text-gray-600">
          {goals.length === 0 ? (
            <>
              <p className="text-lg mb-2">No goals yet</p>
              <p className="text-sm mb-4">Add a goal to get started</p>
            </>
          ) : (
            <p className="text-sm mb-4">Click a goal above or add a new one</p>
          )}
          <button
            onClick={addGoal}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm text-gray-300 border border-dashed border-gray-600 hover:border-gray-400 hover:text-white transition-all duration-200"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Goal
          </button>
        </div>
      )}
    </div>
  );
}
