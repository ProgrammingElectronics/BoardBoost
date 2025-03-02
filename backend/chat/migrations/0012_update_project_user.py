from django.db import migrations, models
import django.db.models.deletion

def assign_admin_to_projects(apps, schema_editor):
    """
    Assign the first superuser (admin) to any projects without users.
    If no superuser exists, assign the first regular user.
    """
    User = apps.get_model('auth', 'User')
    Project = apps.get_model('chat', 'Project')
    
    # Try to get a superuser
    admin_user = User.objects.filter(is_superuser=True).first()
    
    # If no superuser, get any user
    if not admin_user:
        admin_user = User.objects.first()
    
    # If there are any users at all
    if admin_user:
        # Assign admin user to all projects without a user
        Project.objects.filter(user__isnull=True).update(user=admin_user)
    elif Project.objects.filter(user__isnull=True).exists():
        # If there are projects without users and no users exist, this is a problem
        raise Exception(
            "Cannot migrate: There are projects without users, but no users exist in the system. "
            "Please create at least one user first."
        )


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0011_project_query_model_project_summary_model_and_more'),  # Replace with your last migration name
        ('auth', '0012_alter_user_first_name_max_length'),  # Standard auth migration
    ]

    operations = [
        # First run the function to assign users to existing projects
        migrations.RunPython(assign_admin_to_projects),
        
        # Then make the user field non-nullable and required
        migrations.AlterField(
            model_name='project',
            name='user',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='projects',
                to='auth.user'
            ),
        ),
    ]