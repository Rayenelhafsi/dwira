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
  isAfter
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
    const status = getDateStatus(date);
    return status === 'blocked' || status === 'booked' || status === 'past';
  };

  const isDatePending = (date: Date) => {
    return getDateStatus(date) === 'pending';
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
      
      const hasUnavailableDates = datesInRange.some(d => isDateUnavailable(d) && !isSameDay(d, date));
      
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
    const isInSelectedRange = isDateInSelectedRange(date);
    const isPending = dateStatus === 'pending';

    let className = "w-full aspect-square flex items-center justify-center text-sm rounded-lg cursor-pointer transition-all relative ";
    
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
    } else if (isSelected && isPending) {
      // Dark Orange for selected pending dates (user's selection over pending)
      className += "bg-orange-700 text-white font-bold ";
    } else if (isInSelectedRange && isPending) {
      // Dark Orange for pending dates in selected range
      className += "bg-orange-700 text-white font-bold ";
    } else if (isPending) {
      // Light Orange for pending dates not selected (En attente de confirmation)
      className += "bg-orange-200 text-orange-800 hover:bg-orange-300 ";
    } else if (isSelected) {
      // Dark Green for Sélectionné (entire selected period)
      className += "bg-emerald-600 text-white font-bold ";
    } else {
      // Light Green for Disponible
      className += "bg-green-100 text-green-700 hover:bg-green-200 hover:scale-110 ";
    }

    return className;
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

  const weekDays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          type="button"
        >
          <ChevronLeft size={20} />
        </button>
        
        <h3 className="text-lg font-bold capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: fr })}
        </h3>
        
        <button
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          type="button"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Week days header */}
      <div className="grid grid-cols-7 gap-2 mb-2">
        {weekDays.map((day) => (
          <div key={day} className="text-center text-xs font-semibold text-gray-500 py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar days */}
      <div className="grid grid-cols-7 gap-2">
        {days.map((day, idx) => {
          const label = getDayLabel(day);
          return (
            <div key={idx} onClick={() => handleDateClick(day)}>
              <div className={getDayClassName(day)}>
                <div className="flex flex-col items-center justify-center">
                  <span>{format(day, "d")}</span>
                  {label && (
                    <span className="text-[8px] font-normal leading-tight">{label}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-6 pt-6 border-t border-gray-100 flex flex-wrap gap-4 text-xs">
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
        <div className="mt-4 p-4 bg-emerald-50 rounded-lg">
          <p className="text-sm text-emerald-800 font-medium">
            Dates sélectionnées : {format(selectedStart, "d MMM", { locale: fr })} - {format(selectedEnd, "d MMM yyyy", { locale: fr })}
          </p>
        </div>
      )}
    </div>
  );
}
