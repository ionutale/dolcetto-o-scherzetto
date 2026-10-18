/**
 * Copy/share for the black box — iOS-first. `navigator.share` opens the system
 * share sheet (WhatsApp / Mail in two taps), the async clipboard covers desktop
 * and modern iOS, and a hidden textarea is the last resort. Nothing here ever
 * throws; every helper reports its outcome as a boolean.
 */

/** Copy `text` to the clipboard; `false` when the platform refused. */
export async function copyText(text: string): Promise<boolean> {
	try {
		if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch {
		/* permission denied or no transient activation: try the old way */
	}
	try {
		const area = document.createElement('textarea');
		area.value = text;
		area.setAttribute('readonly', '');
		area.style.position = 'fixed';
		area.style.top = '0';
		area.style.left = '0';
		area.style.opacity = '0';
		document.body.appendChild(area);
		area.focus();
		area.select();
		area.setSelectionRange(0, area.value.length);
		const ok = document.execCommand('copy');
		document.body.removeChild(area);
		return ok;
	} catch {
		return false;
	}
}

/** Share `text` through the system sheet, falling back to the clipboard. */
export async function shareText(title: string, text: string): Promise<boolean> {
	try {
		const nav = navigator as Navigator & {
			share?: (data: { title?: string; text?: string }) => Promise<void>;
		};
		if (typeof nav.share === 'function') {
			await nav.share({ title, text });
			return true;
		}
	} catch {
		/* the user cancelled the sheet, or share is unsupported: copy instead */
	}
	return copyText(text);
}
