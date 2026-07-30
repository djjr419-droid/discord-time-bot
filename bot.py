import os
import discord
from discord.ext import tasks
from datetime import datetime
import pytz

intents = discord.Intents.default()
client = discord.Client(intents=intents)

# Paste your #timezones channel ID here
CHANNEL_ID = 1532414106311590028  

@client.event
async def on_ready():
    print(f"Logged in as {client.user}")
    update_times_loop.start()

@tasks.loop(hours=1.0)
async def update_times_loop():
    channel = client.get_channel(CHANNEL_ID)
    if not channel:
        return

    # Define timezones
    tz_sao_paulo = pytz.timezone('America/Sao_Paulo')
    tz_warsaw = pytz.timezone('Europe/Warsaw')
    tz_dammam = pytz.timezone('Asia/Riyadh')
    tz_singapore = pytz.timezone('Asia/Singapore')
    tz_tokyo = pytz.timezone('Asia/Tokyo')
    tz_sydney = pytz.timezone('Australia/Sydney')

    now = datetime.now()
    
    # Format times
    sp_time = now.astimezone(tz_sao_paulo).strftime('%H:%M')
    warsaw_time = now.astimezone(tz_warsaw).strftime('%H:%M')
    dammam_time = now.astimezone(tz_dammam).strftime('%H:%M')
    sg_time = now.astimezone(tz_singapore).strftime('%H:%M')
    tokyo_time = now.astimezone(tz_tokyo).strftime('%H:%M')
    sydney_time = now.astimezone(tz_sydney).strftime('%H:%M')

    message_content = (
        "**Server Region Times**\n"
        f"🇧🇷 São Paulo: {sp_time}\n"
        f"🇵🇱 Warsaw: {warsaw_time}\n"
        f"🇸🇦 Dammam: {dammam_time}\n"
        f"🇸🇬 Singapore: {sg_time}\n"
        f"🇯🇵 Tokyo: {tokyo_time}\n"
        f"🇦🇺 Sydney: {sydney_time}"
    )

    await channel.send(message_content)

# Paste your token inside the quotes below
client.run(os.getenv('DISCORD_TOKEN'))