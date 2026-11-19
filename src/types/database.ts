export type UserRole = "admin" | "secretary" | "professor" | "student";

export type AppUser = {
  id: string;
  email: string;
  firstname: string;
  lastname: string;
  role: UserRole;
  isactive: boolean;
  identifier?: string | null;
  fullName: string;
  initials: string;
  payment_type?: "hourly" | "percentage" | null;
  hourly_rate?: number | null;
  percentage_rate?: number | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  billing_notes?: string | null;
};

export type Domain = {
  id: string;
  name: string;
  isactive: boolean;
};

export type TrainingModule = {
  id: string;
  name: string;
  domainid?: string | null;
  domainName?: string;
  isactive: boolean;
  price_per_session?: number | null;
  monthly_price?: number | null;
  level_name?: string | null;
  category?: string | null;
};

export type UniversityModule = TrainingModule;

export type TrainingGroup = {
  id: string;
  name: string;
  moduleid: string;
  moduleName?: string;
  isactive: boolean;
};

export type UniversityGroup = TrainingGroup;

export type Enrollment = {
  id: string;
  studentid: string;
  groupid: string;
  groupName?: string;
  moduleName?: string;
  status: "active" | "completed" | "dropped";
  enrolledat: string;
};

export type Room = {
  id: string;
  name: string;
  code: string;
  capacity: number;
  hasprojector: boolean;
  hascomputers: boolean;
  isactive: boolean;
};

export type UniversityRoom = Room;

export type TimeSlot = {
  id: string;
  label: string;
  starttime: string;
  endtime: string;
  orderindex: number;
  isactive: boolean;
};

export type SessionData = {
  id: string;
  moduleId: string;
  moduleName: string;
  professorId: string;
  professorName: string;
  groupId: string;
  groupName: string;
  roomId: string;
  roomName: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: string;
  sessionType: string;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  totalStudents: number;
  weeklyScheduleEntryId?: string | null;
  sourceMode?: "realtime" | "retroactive" | "override" | "manual" | null;
  startedAt?: string | null;
  closedAt?: string | null;
  startedBy?: string | null;
  closedBy?: string | null;
};

export type WeeklyScheduleEntry = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  moduleId: string;
  moduleName: string;
  professorId: string;
  professorName: string;
  groupId: string;
  groupName: string;
  roomId: string;
  roomName: string;
  sessionType: string;
  isActive: boolean;
  validFrom: string | null;
  validTo: string | null;
  timeSlotId?: string | null;
  versionNo?: number;
  createdBy?: string | null;
  updatedBy?: string | null;
  dayLabel: string;
};

export type SessionOverride = {
  id: string;
  scheduleEntryId: string;
  overrideDate: string;
  overrideType: "cancel" | "move" | "room_change" | "teacher_change";
  newDayOfWeek?: number | null;
  newTimeSlotId?: string | null;
  newTeacherId?: string | null;
  newRoomId?: string | null;
  reason?: string | null;
  createdBy: string;
  createdAt: string;
};

export type ProfessorGroup = {
  professorid: string;
  groupid: string;
  groupName?: string;
};

export type ProfessorAssignment = ProfessorGroup;

export type WeeklyEntryStatus = "planned" | "confirmed" | "published" | "cancelled" | "moved" | "rescheduled";

export type WeeklyEntry = {
  id: string;
  groupid: string;
  week_start: string;
  dayofweek: number;
  starttime: string;
  endtime: string;
  professorid: string;
  professorName?: string;
  roomid: string;
  roomName?: string;
  groupName?: string;
  moduleName?: string;
  moduleid?: string;
  status?: WeeklyEntryStatus;
  replaced_by?: string | null;
  replaces?: string | null;
};

export type AuditLogEntry = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: "create" | "update" | "delete" | "cancel" | "restore" | "publish";
  user_id: string;
  user_name?: string;
  before_data?: Record<string, unknown>;
  after_data?: Record<string, unknown>;
  created_at: string;
};

export type ProfessorAbsence = {
  id: string;
  professorid: string;
  professorName?: string;
  date_start: string;
  date_end: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  replacement_professorid?: string | null;
  replacement_professorName?: string | null;
};

export type Holiday = {
  id: string;
  name: string;
  date_start: string;
  date_end: string;
  type: "holiday" | "vacation" | "bridge" | "event";
  isactive: boolean;
};

export type AcademicYear = {
  id: string;
  name: string;
  date_start: string;
  date_end: string;
  isactive: boolean;
};

export type AttendanceRecord = {
  sessionId: string;
  studentId: string;
  studentName: string;
  status: "present" | "absent" | "late" | "justified" | "unmarked";
  markedAt: string;
};

export type PaymentType = "hourly" | "percentage";
export type PaymentStatus = "paid" | "partial" | "late" | "unpaid";
export type PaymentMethod = "cash" | "baridimob" | "ccp" | "bank_transfer" | "check";

export type StudentPayment = {
  id: string;
  student_id: string;
  studentName?: string;
  studentEmail?: string;
  parentName?: string;
  parentPhone?: string;
  billing_period: string;
  amount_due: number;
  amount_paid: number;
  due_date: string;
  paid_at: string | null;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfessorPaymentBreakdown = {
  sessions?: {
    date: string;
    startTime: string;
    endTime: string;
    moduleName: string;
    groupName: string;
    durationHours: number;
  }[];
  totalHours?: number;
  studentCollections?: {
    studentId: string;
    studentName: string;
    groupName: string;
    amountPaid: number;
  }[];
  totalCollected?: number;
  startDate?: string;
  endDate?: string;
  periodLabel?: string;
};

export type ProfessorPayment = {
  id: string;
  professor_id: string;
  professorName?: string;
  billing_period: string;
  payment_type: PaymentType;
  rate_applied: number;
  base_calculation: ProfessorPaymentBreakdown;
  total_amount: number;
  status: "draft" | "validated" | "paid";
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

