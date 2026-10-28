import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Task } from '../types';

export const generateTasksPDF = (tasks: Task[], projectName: string = 'Alle Projekte') => {
  const doc = new jsPDF('p', 'mm', 'a4');

  // Header
  doc.setFontSize(20);
  doc.text('Pendenzen-Bericht', 14, 22);

  doc.setFontSize(12);
  doc.text(`Projekt: ${projectName}`, 14, 32);
  doc.text(`Exportdatum: ${new Date().toLocaleDateString()}`, 14, 40);

  // Table mapping
  const tableColumn = ["Status", "Priorität", "Titel", "Fällig am", "Dokument"];
  const tableRows: any[] = [];

  tasks.forEach(task => {
    const taskData = [
      task.status,
      task.priority,
      task.title,
      task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '-',
      (task as any).document?.filename || '-'
    ];
    tableRows.push(taskData);
  });

  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: 50,
    theme: 'grid',
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] }, // blue-600
  });

  doc.save(`Pendenzen_${projectName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
};
