import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  format, 
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
  parseISO,
  isBefore,
  startOfDay,
  isAfter,
  addDays
} from "date-fns";
import { fr } from "date-fns/locale";

interface DateStatus {
  start: string;
  end: string;
  status: 'blocked' | 'pending' | 'booked';
}

interface AvailabilityCalendarProps {
  unavailableDates?: DateStatus[];
  onDateRangeSelect: (startDate: Date | null, endDate: Date | null) => void;
  selectedStart: Date | null;
  selectedEnd: Date | null;
}

export default function AvailabilityCalendar({ 
  unavailableDates = [], 
  onDateRangeSelect,
  selectedStart,
  selectedEnd
}: AvailabilityCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const today = startOfDay(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const toDayKey = (date: Date) => format(date, "yyyy-MM-dd");
  const normalizeKey = (value: string) => String(value || "").slice(0, 10);

  const getBlockingStatusForDay = (day: Date): 'blocked' | 'pending' | 'booked' | null => {
    const key = toDayKey(day);
    const blocking = unavailableDates.find((range) => {
      const status = String(range.status || '').toLowerCase();
      if (status !== 'blocked' && status !== 'booked' && status !== 'pending') return false;
      const startKey = normalizeKey(range.start);
      const endKey = normalizeKey(range.end);
      if (!startKey || !endKey) return false;
      return startKey <= key && key <= endKey;
    });
    if (!blocking) return null;
    const status = String(blocking.status).toLowerCase();
    if (status === 'booked') return 'booked';
    if (status === 'pending') return 'pending';
    return 'blocked';
  };

  const getDateStatus = (date: Date): 'available' | 'blocked' | 'pending' | 'booked' | 'past' => {
    // Check if date is in the past
    if (isBefore(date, today)) {
      return 'past';
    }

    // Check if date is in any unavailable range
    const unavailableRange = unavailableDates.find((range) => {
      const start = parseISO(range.start);
      const end = parseISO(range.end);
      return isWithinInterval(date, { start, end });
    });

    if (unavailableRange) {
      return unavailableRange.status;
    }

    return 'available';
  };

  const isDateUnavailable = (date: Date) => {
    if (isBefore(date, today)) return true;
    const blockingStatus = getBlockingStatusForDay(date);
    return blockingStatus === 'blocked' || blockingStatus === 'booked' || blockingStatus === 'pending';
  };

  const canUseAsCheckoutBoundary = (date: Date) => {
    return unavailableDates.some((range) => {
      const status = String(range.status || '').toLowerCase();
      if (status !== 'blocked' && status !== 'booked' && status !== 'pending') return false;
      const start = parseISO(range.start);
      return isSameDay(start, date);
    });
  };

  const canUseAsCheckinBoundary = (date: Date) => {
    const matchesBoundaryEnd = unavailableDates.some((range) => {
      const status = String(range.status || '').toLowerCase();
      if (status !== 'blocked' && status !== 'booked' && status !== 'pending') return false;
      const endKey = normalizeKey(range.end);
      return endKey === toDayKey(date);
    });
    if (matchesBoundaryEnd) return true;

    // Business rule requested: allow check-in on blocked/booked day
    // when the next day is available.
    const nextDay = addDays(date, 1);
    return getBlockingStatusForDay(nextDay) === null;
  };

  const isDateInSelectedRange = (date: Date) => {
    if (!selectedStart || !selectedEnd) return false;
    const rangeStart = selectedStart < selectedEnd ? selectedStart : selectedEnd;
    const rangeEnd = selectedStart < selectedEnd ? selectedEnd : selectedStart;
    return isWithinInterval(date, { start: rangeStart, end: rangeEnd });
  };

  const isDateSelected = (date: Date) => {
    if (!selectedStart && !selectedEnd) return false;
    const isStart = selectedStart && isSameDay(date, selectedStart);
    const isEnd = selectedEnd && isSameDay(date, selectedEnd);
    const isInRange = isDateInSelectedRange(date);
    return isStart || isEnd || isInRange;
  };

  const handleDateClick = (date: Date) => {
    // Don't allow selection of unavailable dates (blocked, booked, past)
    // But allow pending dates to be selected
    if (isDateUnavailable(date)) {
      // Allow selecting a blocked/booked day as arrival boundary
      // when it is exactly the end day of an occupied range.
      if ((!selectedStart || (selectedStart && selectedEnd)) && canUseAsCheckinBoundary(date)) {
        onDateRangeSelect(date, null);
      }
      // Allow selecting a blocked/booked day as departure boundary
      // when it is exactly the first day of another occupied range.
      if (selectedStart && !selectedEnd && date >= selectedStart && canUseAsCheckoutBoundary(date)) {
        onDateRangeSelect(selectedStart, date);
      }
      return;
    }

    // If no start date selected, or both dates are selected, start new selection (Arrivée)
    if (!selectedStart || (selectedStart && selectedEnd)) {
      onDateRangeSelect(date, null);
    } else {
      // We have a start date but no end date - this will be the Départ
      // Check if there are any unavailable dates between selectedStart and date
      // Pending dates are allowed in the selection
      const rangeStart = selectedStart < date ? selectedStart : date;
      const rangeEnd = selectedStart < date ? date : selectedStart;
      const datesInRange = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
      
      const hasUnavailableDates = datesInRange.some((d) => (
        isDateUnavailable(d)
        && !isSameDay(d, date)
        && !(selectedStart && isSameDay(d, selectedStart))
      ));
      
      if (hasUnavailableDates) {
        // If there are unavailable dates in between, start new selection
        onDateRangeSelect(date, null);
      } else {
        // Complete the range - always set with proper ordering
        // If user clicked before arrival, swap them
        if (date < selectedStart) {
          onDateRangeSelect(date, selectedStart);
        } else {
          onDateRangeSelect(selectedStart, date);
        }
      }
    }
  };

  const getDayClassName = (date: Date) => {
    const isCurrentMonth = isSameMonth(date, currentMonth);
    const dateStatus = getDateStatus(date);
    const isSelected = isDateSelected(date);

    let className = "w-full aspect-square flex items-center justify-center text-sm rounded-lg cursor-pointer transition-all relative overflow-hidden ";
    
    if (!isCurrentMonth) {
      className += "text-gray-300 ";
    } else if (dateStatus === 'past') {
      className += "text-gray-300 cursor-not-allowed ";
    } else if (dateStatus === 'blocked') {
      // Black for Bloqué/Non disponible
      className += "bg-gray-900 text-white cursor-not-allowed ";
    } else if (dateStatus === 'booked') {
      // Red for Réservé
      className += "bg-red-500 text-white cursor-not-allowed ";
    } else if (dateStatus === 'pending') {
      // Pending requests must also block the public calendar.
      className += "bg-orange-400 text-white cursor-not-allowed ";
    } else if (isSelected) {
      // Dark Green for Sélectionné (entire selected period)
      className += "bg-emerald-600 text-white font-bold ";
    } else {
      // Light Green for Disponible
      className += "bg-green-100 text-green-700 hover:bg-green-200 hover:scale-110 ";
    }

    return className;
  };

  const getSplitDayVisual = (date: Date): { enabled: boolean; leftClass: string; rightClass: string } => {
    const isStart = !!selectedStart && isSameDay(date, selectedStart);
    const isEnd = !!selectedEnd && isSameDay(date, selectedEnd);
    const selectedClass = "bg-emerald-600";
    const availableClass = "bg-green-100";
    if (isEnd) {
      return { enabled: true, leftClass: selectedClass, rightClass: availableClass };
    }
    if (isStart) {
      return { enabled: true, leftClass: availableClass, rightClass: selectedClass };
    }

    const blocking = getBlockingStatusForDay(date);
    const canCheckoutOnThisDay = !!blocking && canUseAsCheckoutBoundary(date);
    const canCheckinOnThisDay = !!blocking && canUseAsCheckinBoundary(date);
    const isTransition = !!blocking && (canCheckoutOnThisDay || canCheckinOnThisDay);
    if (!isTransition) {
      return { enabled: false, leftClass: "", rightClass: "" };
    }
    const blockedClass = blocking === "booked" ? "bg-red-500" : blocking === "pending" ? "bg-orange-400" : "bg-gray-900";
    // left = morning(departure side), right = evening(arrival side)
    if (canCheckinOnThisDay && !canCheckoutOnThisDay) {
      return { enabled: true, leftClass: blockedClass, rightClass: availableClass };
    }
    if (canCheckoutOnThisDay && !canCheckinOnThisDay) {
      return { enabled: true, leftClass: availableClass, rightClass: blockedClass };
    }
    return {
      enabled: true,
      leftClass: blockedClass,
      rightClass: blockedClass,
    };
  };

  const getDayLabel = (date: Date): string | null => {
    if (selectedStart && isSameDay(date, selectedStart)) {
      return "Arrivée";
    }
    if (selectedEnd && isSameDay(date, selectedEnd)) {
      return "Départ";
    }
    return null;
  };

  const getDayLabelClassName = (date: Date, splitEnabled: boolean) => {
    const isStart = !!selectedStart && isSameDay(date, selectedStart);
    const isEnd = !!selectedEnd && isSameDay(date, selectedEnd);
    if (!isStart && !isEnd) return "hidden";
    const base = "absolute bottom-1 z-20 rounded-full px-1.5 py-[2px] text-[8px] font-semibold uppercase tracking-[0.04em] leading-none shadow-sm";
    if (splitEnabled) {
      if (isStart) return `${base} right-1 bg-emerald-700 text-white`;
      return `${base} left-1 bg-emerald-700 text-white`;
    }
    return `${base} left-1/2 -translate-x-1/2 bg-emerald-700 text-white`;
  };

  const weekDays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  return (
    <div className="w-full max-w-full overflow-hidden rounded-xl border border-gray-200 bg-white p-3 sm:p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-2 sm:mb-6">
        <button
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="rounded-lg p-1.5 transition-colors hover:bg-gray-100 sm:p-2"
          type="button"
        >
          <ChevronLeft size={18} className="sm:h-5 sm:w-5" />
        </button>
        
        <h3 className="text-base font-bold capitalize sm:text-lg">
          {format(currentMonth, "MMMM yyyy", { locale: fr })}
        </h3>
        
        <button
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="rounded-lg p-1.5 transition-colors hover:bg-gray-100 sm:p-2"
          type="button"
        >
          <ChevronRight size={18} className="sm:h-5 sm:w-5" />
        </button>
      </div>

      {/* Week days header */}
      <div className="mb-1 grid grid-cols-7 gap-1 sm:mb-2 sm:gap-2">
        {weekDays.map((day) => (
          <div key={day} className="py-1 text-center text-[11px] font-semibold text-gray-500 sm:py-2 sm:text-xs">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar days */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((day, idx) => {
          const label = getDayLabel(day);
          const splitVisual = getSplitDayVisual(day);
          return (
            <div key={idx} onClick={() => handleDateClick(day)}>
              <div className={getDayClassName(day)}>
                {splitVisual.enabled && (
                  <>
                    <span className={`pointer-events-none absolute inset-y-0 left-0 w-1/2 rounded-l-lg ${splitVisual.leftClass}`} />
                    <span className={`pointer-events-none absolute inset-y-0 right-0 w-1/2 rounded-r-lg ${splitVisual.rightClass}`} />
                  </>
                )}
                <div className={`relative z-10 flex h-full w-full flex-col items-center justify-center ${splitVisual.enabled ? "text-gray-900" : ""}`}>
                  <span className={splitVisual.enabled ? "rounded-full bg-white/90 px-1.5 text-[13px] font-semibold text-gray-900" : ""}>
                    {format(day, "d")}
                  </span>
                  {label && (
                    <span className={getDayLabelClassName(day, splitVisual.enabled)}>
                      {label}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 grid grid-cols-1 gap-x-4 gap-y-3 border-t border-gray-100 pt-4 text-xs sm:mt-6 sm:grid-cols-2 sm:pt-6 lg:grid-cols-3">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-100 rounded border border-green-200"></div>
          <span className="text-gray-600">Disponible</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-900 rounded"></div>
          <span className="text-gray-600">Bloqué/Non disponible</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-orange-200 rounded border border-orange-300"></div>
          <span className="text-gray-600">En attente (non sélectionné)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-orange-700 rounded"></div>
          <span className="text-gray-600">En attente (sélectionné)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-500 rounded"></div>
          <span className="text-gray-600">Réservé</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-emerald-600 rounded"></div>
          <span className="text-gray-600">Sélectionné</span>
        </div>
      </div>

      {selectedStart && selectedEnd && (
        <div className="mt-4 rounded-lg bg-emerald-50 p-3 sm:p-4">
          <p className="text-sm font-medium text-emerald-800">
            Dates sélectionnées : {format(selectedStart, "d MMM", { locale: fr })} - {format(selectedEnd, "d MMM yyyy", { locale: fr })}
          </p>
        </div>
      )}
    </div>
  );
}
