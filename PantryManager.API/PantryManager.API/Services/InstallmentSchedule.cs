using PantryManager.API.Models;

namespace PantryManager.API.Services
{
    // Cronogramas de meses sin intereses y cargos recurrentes. Métodos puros: no tocan la base de datos.
    public static class InstallmentSchedule
    {
        // Hora de México (UTC-6), la misma que usan los demás endpoints.
        public static DateOnly TodayInMexico() => DateOnly.FromDateTime(DateTime.UtcNow.AddHours(-6));

        // Pago normal: total / meses, redondeado a centavos.
        public static decimal MonthlyAmount(decimal total, int months) =>
            Math.Round(total / months, 2, MidpointRounding.AwayFromZero);

        // Monto del pago "index" (base 0). El último pago absorbe la diferencia de redondeo.
        public static decimal PaymentAmount(decimal total, int months, int index)
        {
            var monthly = MonthlyAmount(total, months);
            return index == months - 1 ? total - monthly * (months - 1) : monthly;
        }

        public static DateOnly PaymentDate(DateOnly firstPaymentDate, int index) =>
            firstPaymentDate.AddMonths(index);

        // Cuántos pagos vencen en la fecha asOf o antes.
        public static int CountDue(DateOnly firstPaymentDate, int months, DateOnly asOf)
        {
            var count = 0;
            for (var i = 0; i < months && PaymentDate(firstPaymentDate, i) <= asOf; i++)
            {
                count++;
            }
            return count;
        }

        // Índice del pago que vence en ese año y mes, o null si ningún pago cae en ese mes.
        public static int? PaymentIndexInMonth(DateOnly firstPaymentDate, int months, int year, int month)
        {
            for (var i = 0; i < months; i++)
            {
                var due = PaymentDate(firstPaymentDate, i);
                if (due.Year == year && due.Month == month) return i;
            }
            return null;
        }

        // Próxima fecha de cobro a partir de "from" (incluido). Si el día no existe en el mes, cae el último día.
        public static DateOnly NextRecurringDate(RecurringCharge charge, DateOnly from)
        {
            if (charge.Frequency == "yearly")
            {
                var month = charge.MonthOfYear ?? 1;
                var thisYear = ClampedDate(from.Year, month, charge.DayOfMonth);
                return thisYear >= from ? thisYear : ClampedDate(from.Year + 1, month, charge.DayOfMonth);
            }

            var thisMonth = ClampedDate(from.Year, from.Month, charge.DayOfMonth);
            if (thisMonth >= from) return thisMonth;

            var nextMonth = new DateOnly(from.Year, from.Month, 1).AddMonths(1);
            return ClampedDate(nextMonth.Year, nextMonth.Month, charge.DayOfMonth);
        }

        public static bool RecurringOccursInMonth(RecurringCharge charge, int year, int month)
        {
            if (charge.Frequency == "yearly") return charge.MonthOfYear == month;
            return true;
        }

        private static DateOnly ClampedDate(int year, int month, int day) =>
            new DateOnly(year, month, Math.Min(day, DateTime.DaysInMonth(year, month)));
    }
}
