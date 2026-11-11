import React, { useState } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  X,
  Filter,
  Check
} from 'lucide-react';
import type { CommercialTask } from '../types.js';

interface TasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: CommercialTask[];
  onUpdateTask: (id: string, updates: Partial<CommercialTask>) => Promise<void>;
  onCreateTask: (task: Partial<CommercialTask>) => Promise<void>;
}

export const TasksModal: React.FC<TasksModalProps> = ({
  isOpen,
  onClose,
  tasks,
  onUpdateTask,
  onCreateTask,
}) => {
  const [filterStatus, setFilterStatus] = useState<'pendiente' | 'completada' | 'all'>('pendiente');
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState<CommercialTask['priority']>('media');
  const [newCategory, setNewCategory] = useState<CommercialTask['category']>('general');
  const [newDueDate, setNewDueDate] = useState('');

  if (!isOpen) return null;

  const filteredTasks = tasks.filter(t => {
    if (filterStatus === 'all') return true;
    return t.status === filterStatus;
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    await onCreateTask({
      id: `task-${Date.now()}`,
      title: newTitle,
      description: newDesc,
      priority: newPriority,
      category: newCategory,
      dueDate: newDueDate || null,
      status: 'pendiente',
      createdAt: new Date().toISOString()
    });

    setIsCreating(false);
    setNewTitle('');
    setNewDesc('');
    setNewDueDate('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden my-6">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2">
            <Clock className="w-5 h-5 text-amber-600" />
            <h2 className="text-base font-extrabold text-slate-900">
              Tareas y Seguimientos Comerciales
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters & Actions Bar */}
        <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between text-xs bg-white">
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => setFilterStatus('pendiente')}
              className={`px-3 py-1 rounded font-bold transition-colors ${
                filterStatus === 'pendiente'
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              Pendientes ({tasks.filter(t => t.status === 'pendiente').length})
            </button>
            <button
              onClick={() => setFilterStatus('completada')}
              className={`px-3 py-1 rounded font-bold transition-colors ${
                filterStatus === 'completada'
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              Completadas ({tasks.filter(t => t.status === 'completada').length})
            </button>
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1 rounded font-bold transition-colors ${
                filterStatus === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              Todas ({tasks.length})
            </button>
          </div>

          <button
            onClick={() => setIsCreating(!isCreating)}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center space-x-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isCreating ? 'Cerrar formulario' : 'Nueva tarea'}</span>
          </button>
        </div>

        {/* Create Task Form */}
        {isCreating && (
          <form onSubmit={handleCreate} className="p-4 bg-slate-50 border-b border-slate-200 text-xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                required
                placeholder="Título de la tarea..."
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="w-full border rounded p-2"
              />
              <div className="flex space-x-2">
                <select
                  value={newPriority}
                  onChange={e => setNewPriority(e.target.value as any)}
                  className="w-1/2 border rounded p-2 font-semibold"
                >
                  <option value="alta">Prioridad Alta</option>
                  <option value="media">Prioridad Media</option>
                  <option value="baja">Prioridad Baja</option>
                </select>
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value as any)}
                  className="w-1/2 border rounded p-2"
                >
                  <option value="seguimiento">Seguimiento</option>
                  <option value="revision_pago">Revisión Pago</option>
                  <option value="intervencion_ia">Intervención IA</option>
                  <option value="conector">Conector</option>
                  <option value="general">General</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <input
                  type="text"
                  placeholder="Descripción detallada o acción a realizar..."
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  className="w-full border rounded p-2"
                />
              </div>
              <div>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={e => setNewDueDate(e.target.value)}
                  className="w-full border rounded p-2"
                />
              </div>
            </div>

            <div className="text-right">
              <button
                type="submit"
                className="px-4 py-1.5 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 shadow-2xs"
              >
                Crear Tarea
              </button>
            </div>
          </form>
        )}

        {/* Tasks List */}
        <div className="p-6 overflow-y-auto space-y-3 text-xs flex-1">
          {filteredTasks.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              No hay tareas en esta vista.
            </div>
          ) : (
            filteredTasks.map(task => {
              const isDone = task.status === 'completada';
              return (
                <div
                  key={task.id}
                  className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 transition-colors ${
                    isDone
                      ? 'bg-slate-50 border-slate-200 opacity-60'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start space-x-3 flex-1">
                    <button
                      onClick={() =>
                        onUpdateTask(task.id, {
                          status: isDone ? 'pendiente' : 'completada'
                        })
                      }
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                        isDone
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-slate-300 hover:border-slate-400'
                      }`}
                    >
                      {isDone && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </button>

                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            task.priority === 'alta'
                              ? 'bg-rose-500'
                              : task.priority === 'media'
                              ? 'bg-amber-500'
                              : 'bg-slate-400'
                          }`}
                        />
                        <h4
                          className={`font-bold text-xs ${
                            isDone ? 'line-through text-slate-400' : 'text-slate-900'
                          }`}
                        >
                          {task.title}
                        </h4>
                      </div>

                      <p className="text-slate-600 text-[11px] leading-relaxed">
                        {task.description}
                      </p>

                      <div className="flex items-center space-x-3 text-[10px] text-slate-400 pt-1">
                        <span className="uppercase font-bold">{task.category.replace('_', ' ')}</span>
                        {task.dueDate && <span>Vencimiento: {task.dueDate}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
