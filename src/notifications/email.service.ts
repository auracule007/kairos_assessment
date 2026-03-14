import { Injectable, Logger } from '@nestjs/common';
import { ContractConfirmationPayload } from 'src/common/interfaces/contract-confirm.interface';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async sendContractConfirmation(
    payload: ContractConfirmationPayload,
  ): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;

    if (!apiKey || !fromEmail) {
      this.logger.warn(
        'Skipping email: RESEND_API_KEY or RESEND_FROM_EMAIL is missing.',
      );
      return false;
    }

    const maxRetries = Number(process.env.EMAIL_MAX_RETRIES ?? 3);

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: payload.to,
            subject: 'Your job application is now contracted',
            html: `<p>Your application <strong>${payload.applicationId}</strong> is now contracted.</p><p>Contract URL: <a href="${payload.contractUrl}">${payload.contractUrl}</a></p>`,
          }),
        });

        if (!response.ok) {
          throw new Error(
            `Resend API failed with ${response.status}: ${await response.text()}`,
          );
        }

        return true;
      } catch (error) {
        this.logger.warn(
          `Contract email attempt ${attempt}/${maxRetries} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );

        if (attempt === maxRetries) {
          this.logger.error('Contract email exhausted all retries.');
          return false;
        }

        await this.sleep(200 * 2 ** attempt);
      }
    }

    return false;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
