import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { db } from "../db";
import { env } from "../env";
import { guestOrderToken } from "../crypto";
import { sendEmail } from "../email";
import { renderTicketsPdf } from "../tickets/pdf";
import { notify, notifyAdmins, notifyOrganization } from "./notifications";
import { ticketInclude } from "./tickets";

/** Link to an order. Guests get a signed link, since they have no account to log in to. */
export function orderUrl(booking: { id: string; reference: string; userId: string | null }) {
  const base = `${env.appUrl}/orders/${booking.reference}`;
  return booking.userId ? base : `${base}?t=${guestOrderToken(booking.id)}`;
}

export function venueLine(event: { mode: string; venue?: { name: string; city: string } | null }) {
  if (event.mode === "ONLINE") return "Online event";
  return event.venue ? `${event.venue.name}, ${event.venue.city}` : "To be announced";
}

/** Post-commit messages for a confirmed booking. A failure here never undoes the booking. */
export async function sendBookingConfirmedMessages(bookingId: string) {
  try {
    const booking = await db.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: {
        event: { include: { venue: true } },
        tickets: { include: ticketInclude },
        payments: { where: { status: "SUCCEEDED" }, take: 1 },
      },
    });
    const url = orderUrl(booking);
    const when = formatDateTime(booking.event.startsAt, booking.event.timezone);

    await sendEmail("bookingConfirmation", booking.contactEmail, {
      name: booking.contactName,
      event: booking.event.title,
      when,
      venue: venueLine(booking.event),
      reference: booking.reference,
      total: booking.totalMinor === 0 ? "Free" : formatMoney(booking.totalMinor, booking.currency),
      ticketCount: booking.tickets.length,
      url,
    });

    const payment = booking.payments[0];
    if (payment) {
      await sendEmail("paymentConfirmation", booking.contactEmail, {
        name: booking.contactName,
        reference: booking.reference,
        amount: formatMoney(payment.amountMinor, payment.currency),
        method: payment.method ?? payment.gateway,
        transactionId: payment.gatewayTxnId ?? payment.merchantTxnId,
        isTest: payment.gateway === "test",
      });
    }

    const pdf = await renderTicketsPdf(booking.tickets);
    await sendEmail(
      "ticketDelivery",
      booking.contactEmail,
      { name: booking.contactName, event: booking.event.title, ticketCount: booking.tickets.length, url },
      [{ filename: `tixora-${booking.reference}.pdf`, content: pdf, contentType: "application/pdf" }],
    );

    if (booking.userId) {
      await notify(booking.userId, {
        type: "TICKET",
        title: "Your tickets are ready",
        body: `${booking.tickets.length} ticket(s) for ${booking.event.title}. Reference ${booking.reference}.`,
        link: `/orders/${booking.reference}`,
      });
    }
    await notifyOrganization(booking.organizationId, {
      type: "BOOKING",
      title: "New booking",
      body: `${booking.tickets.length} ticket(s) sold for ${booking.event.title}.`,
      link: "/organizer/orders",
    });
  } catch (error) {
    console.error("[booking] confirmation messages failed", error);
  }
}

export async function notifyPaymentNeedsReview(paymentId: string, reason: string) {
  try {
    const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { booking: true } });
    await notifyAdmins({
      type: "PAYMENT",
      title: "Payment needs review",
      body: `${payment.booking.reference}: ${reason}`,
      link: "/admin/payments?status=REVIEW",
    });
    if (payment.booking.userId) {
      await notify(payment.booking.userId, {
        type: "PAYMENT",
        title: "We're reviewing your payment",
        body: `Your payment for ${payment.booking.reference} needs a manual check. You'll be refunded if we can't honour the booking.`,
        link: `/orders/${payment.booking.reference}`,
      });
    }
  } catch (error) {
    console.error("[payment] review notification failed", error);
  }
}

export async function sendRefundMessages(refundId: string) {
  try {
    const refund = await db.refund.findUniqueOrThrow({ where: { id: refundId }, include: { booking: true, payment: true } });
    await sendEmail("refundConfirmation", refund.booking.contactEmail, {
      name: refund.booking.contactName,
      reference: refund.booking.reference,
      amount: formatMoney(refund.amountMinor, refund.payment.currency),
      refundId: refund.gatewayRefundId ?? refund.id,
    });
    if (refund.booking.userId) {
      await notify(refund.booking.userId, {
        type: "REFUND",
        title: "Refund processed",
        body: `${formatMoney(refund.amountMinor, refund.payment.currency)} refunded for ${refund.booking.reference}.`,
        link: `/orders/${refund.booking.reference}`,
      });
    }
  } catch (error) {
    console.error("[refund] messages failed", error);
  }
}
